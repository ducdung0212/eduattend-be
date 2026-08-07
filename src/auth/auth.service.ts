import { BadRequestException, Injectable, NotFoundException, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LambdaService } from '../aws/lambda.service';
import * as bcrypt from 'bcrypt';
import { LRUCache } from 'lru-cache';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private lambdaService: LambdaService,
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