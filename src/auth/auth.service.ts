import { BadRequestException, Injectable, NotFoundException, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LambdaService } from '../aws/lambda.service';
import { RekognitionService } from '../aws/rekognition.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LRUCache } from 'lru-cache';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private lambdaService: LambdaService,
    private rekognitionService: RekognitionService,
    private configService: ConfigService,
  ) {}

  // Map to track failed face login attempts by IP: IP -> { count, lockedUntil }
  private faceLoginAttempts = new LRUCache<string, { count: number; lockedUntil: number }>({
    max: 5000,
    ttl: 1000 * 60 * 60 * 1, // 1 hours
  });

  private recordFailedAttempt(ip: string, now: number) {
    if (ip === 'unknown') return;
    const attempt = this.faceLoginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    attempt.count += 1;
    if (attempt.count >= 3) {
      attempt.lockedUntil = now + 60 * 60 * 1000; 
    }
    this.faceLoginAttempts.set(ip, attempt);
  }

  private resetFailedAttempt(ip: string) {
    this.faceLoginAttempts.delete(ip);
  }

  checkFaceLock(ip: string) {
    const now = Date.now();
    const attempt = this.faceLoginAttempts.get(ip);
    if (attempt && attempt.lockedUntil > now) {
      return { isLocked: true, lockedUntil: attempt.lockedUntil };
    }
    if (attempt && attempt.lockedUntil <= now) {
      this.resetFailedAttempt(ip);
    }
    return { isLocked: false };
  }

  private async generateTokens(payload: any) {
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-for-eduattend',
        expiresIn: '7d',
      }),
    ]);
    return { access_token, refresh_token };
  }

  async login(email: string, pass: string) {
    // 1. Tìm thông tin cơ bản trong bảng User
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Email không tồn tại');

    // 2. Xác thực mật khẩu
    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) throw new UnauthorizedException('Mật khẩu không đúng');

    // 3. Truy vấn thêm mã tương ứng dựa theo Role (liên kết qua user_id)
    let student_code: string | undefined;
    let lecturer_code: string | undefined;

    if (user.role === 'student') {
      const student = await this.prisma.student.findUnique({ where: { user_id: user.id } });
      student_code = student?.student_code;
    } else if (user.role === 'lecturer') {
      const lecturer = await this.prisma.lecturer.findUnique({ where: { user_id: user.id } });
      lecturer_code = lecturer?.lecturer_code;
    }

    // 4. Đóng gói Payload cho JWT
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      ...(student_code && { student_code }),
      ...(lecturer_code && { lecturer_code }),
    };

    // 5. Trả kết quả trọn gói về cho Frontend
    const tokens = await this.generateTokens(payload);
    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email, 
        role: user.role,
        student_code,
        lecturer_code
      }
    };
  }

  async loginFace(imageBase64: string, ip: string = 'unknown') {
    const now = Date.now();
    const attempt = this.faceLoginAttempts.get(ip);
    
    if (attempt && attempt.lockedUntil > now) {
      const remainingMinutes = Math.ceil((attempt.lockedUntil - now) / 60000);
      throw new HttpException({
        message: `Bạn đã nhập sai quá nhiều lần. Chức năng đăng nhập bằng khuôn mặt bị khóa. Vui lòng thử lại sau ${remainingMinutes} phút hoặc dùng mật khẩu.`,
        lockedUntil: attempt.lockedUntil
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    if (attempt && attempt.lockedUntil <= now) {
      // Lock expired, reset
      this.resetFailedAttempt(ip);
    }

    let verifyResult;
    try {
      verifyResult = await this.lambdaService.verifyLecturerFace(imageBase64);
    } catch (error) {
      this.recordFailedAttempt(ip, now);
      throw error;
    }

    if (!verifyResult.success || !verifyResult.data) {
      this.recordFailedAttempt(ip, now);
      const attemptAfter = this.faceLoginAttempts.get(ip);
      if (attemptAfter && attemptAfter.count >= 3) {
        throw new HttpException({
          message: 'Bạn đã nhập sai 3 lần. Chức năng đăng nhập bằng khuôn mặt đã bị khóa.',
          lockedUntil: attemptAfter.lockedUntil
        }, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new UnauthorizedException(verifyResult.message || 'Xác thực khuôn mặt thất bại');
    }

    const { student } = verifyResult.data;
    let user;
    let final_student_code;
    let final_lecturer_code;

    // Phân biệt sinh viên và giảng viên
    if (student.lecturer_code) {
      const lecturer = await this.prisma.lecturer.findUnique({
        where: { lecturer_code: student.lecturer_code },
        include: { user: true },
      });
      if (!lecturer || !lecturer.user) {
        this.recordFailedAttempt(ip, now);
        const attemptAfter = this.faceLoginAttempts.get(ip);
        if (attemptAfter && attemptAfter.count >= 3) {
          throw new HttpException({
            message: 'Tài khoản giảng viên không tồn tại trong hệ thống. Đã khóa tính năng.',
            lockedUntil: attemptAfter.lockedUntil
          }, HttpStatus.TOO_MANY_REQUESTS);
        }
        throw new UnauthorizedException('Tài khoản giảng viên không tồn tại trong hệ thống');
      }
      user = lecturer.user;
      final_lecturer_code = lecturer.lecturer_code;
    } else if (student.student_code) {
      // Chặn sinh viên đăng nhập bằng hình ảnh
      this.recordFailedAttempt(ip, now);
      const attemptAfter = this.faceLoginAttempts.get(ip);
      if (attemptAfter && attemptAfter.count >= 3) {
        throw new HttpException({
          message: 'Chức năng này chỉ dành cho giảng viên. Đã khóa tính năng.',
          lockedUntil: attemptAfter.lockedUntil
        }, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new UnauthorizedException('Chức năng đăng nhập bằng khuôn mặt chỉ dành cho giảng viên.');
    } else {
      this.recordFailedAttempt(ip, now);
      const attemptAfter = this.faceLoginAttempts.get(ip);
      if (attemptAfter && attemptAfter.count >= 3) {
        throw new HttpException({
          message: 'Không thể xác định danh tính. Đã khóa tính năng.',
          lockedUntil: attemptAfter.lockedUntil
        }, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new UnauthorizedException('Không thể xác định danh tính từ kết quả khuôn mặt');
    }

    // Success! Reset attempts.
    this.resetFailedAttempt(ip);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(final_student_code && { student_code: final_student_code }),
      ...(final_lecturer_code && { lecturer_code: final_lecturer_code }),
    };

    const tokens = await this.generateTokens(payload);
    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_code: final_student_code,
        lecturer_code: final_lecturer_code
      }
    };
  }

  async createLivenessSession() {
    const sessionId = await this.rekognitionService.createLivenessSession();
    return { sessionId };
  }

  async loginLiveness(sessionId: string, ip: string = 'unknown') {
    const now = Date.now();
    const attempt = this.faceLoginAttempts.get(ip);
    
    if (attempt && attempt.lockedUntil > now) {
      const remainingMinutes = Math.ceil((attempt.lockedUntil - now) / 60000);
      throw new HttpException({
        message: `Bạn đã bị khóa do thử quá nhiều lần. Vui lòng thử lại sau ${remainingMinutes} phút.`,
        lockedUntil: attempt.lockedUntil
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (attempt && attempt.lockedUntil <= now) {
      this.resetFailedAttempt(ip);
    }

    try {
      // 1. Get Liveness result
      const livenessResult = await this.rekognitionService.getLivenessSessionResults(sessionId);
      console.log(`[Liveness Result] SessionId: ${sessionId}, Status: ${livenessResult.Status}, Confidence: ${livenessResult.Confidence}`);

      if (livenessResult.Status !== 'SUCCEEDED') {
        throw new UnauthorizedException(`Phiên quét khuôn mặt không hợp lệ hoặc đã hết hạn (Trạng thái: ${livenessResult.Status})`);
      }

      // Verify confidence
      const confidenceThreshold = Number(this.configService.get<number>('AWS_LIVENESS_CONFIDENCE_THRESHOLD', 70));
      const confidence = livenessResult.Confidence || 0;
      if (confidence < confidenceThreshold) {
        throw new UnauthorizedException(`Xác thực khuôn mặt thất bại (Liveness: ${confidence.toFixed(2)}%)`);
      }

      // 2. Extract best image for face matching
      const auditImageBytes = livenessResult.ReferenceImage?.Bytes || livenessResult.AuditImages?.[0]?.Bytes;
      if (!auditImageBytes) {
        throw new UnauthorizedException('Không có hình ảnh để đối chiếu');
      }

      // 3. Search face in Rekognition collection
      const faceMatches = await this.rekognitionService.searchFacesByImage(auditImageBytes);
      
      if (!faceMatches || faceMatches.length === 0) {
        throw new UnauthorizedException('Khuôn mặt không khớp với bất kỳ giảng viên nào trong hệ thống');
      }

      // Get the best match
      const bestMatch = faceMatches[0];
      const externalImageId = bestMatch.Face?.ExternalImageId; // Assuming ExternalImageId is lecturer_code

      if (!externalImageId) {
        throw new UnauthorizedException('Khuôn mặt hợp lệ nhưng không tìm thấy mã định danh (ExternalImageId)');
      }

      // 4. Find Lecturer in DB
      const lecturer = await this.prisma.lecturer.findFirst({
        where: { lecturer_code: externalImageId },
        include: { user: true },
      });

      if (!lecturer || !lecturer.user) {
        throw new UnauthorizedException('Tài khoản giảng viên không tồn tại trong hệ thống');
      }

      // Reset attempts on success
      this.resetFailedAttempt(ip);

      const user = lecturer.user;
      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        lecturer_code: lecturer.lecturer_code,
      };

      const tokens = await this.generateTokens(payload);
      return {
        ...tokens,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          lecturer_code: lecturer.lecturer_code
        }
      };
    } catch (error: any) {
      this.recordFailedAttempt(ip, now);
      
      // Nếu là UnauthorizedException (lỗi logic đã định nghĩa)
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Bắt lỗi AWS hoặc lỗi khác
      const errorMessage = error?.message || 'Lỗi hệ thống khi xác thực khuôn mặt';
      throw new HttpException(
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-for-eduattend',
      });
      
      const newPayload = { 
        sub: payload.sub, 
        email: payload.email, 
        role: payload.role,
        ...(payload.student_code && { student_code: payload.student_code }),
        ...(payload.lecturer_code && { lecturer_code: payload.lecturer_code }),
      };

      const tokens = await this.generateTokens(newPayload);
      
      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      };
    } catch (e) {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
  }
   async changePassword(email: string, curPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({
      where: { email }
    });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }
    if (curPass === newPass) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu hiện tại');
    }
    const isMatch = await bcrypt.compare(curPass, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    const hashPassword = await bcrypt.hash(newPass, 10);
    await this.prisma.user.update({
      where: { email },
      data: { password: hashPassword }
    });
    return { message: 'Đổi mật khẩu thành công' };
  }

}