import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LambdaService } from '../aws/lambda.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private lambdaService: LambdaService,
  ) {}

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

  async loginFace(imageBase64: string) {
    const verifyResult = await this.lambdaService.verifyLecturerFace(imageBase64);

    if (!verifyResult.success || !verifyResult.data) {
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
        throw new UnauthorizedException('Tài khoản giảng viên không tồn tại trong hệ thống');
      }
      user = lecturer.user;
      final_lecturer_code = lecturer.lecturer_code;
    } else if (student.student_code) {
      // Chặn sinh viên đăng nhập bằng hình ảnh
      throw new UnauthorizedException('Chức năng đăng nhập bằng khuôn mặt chỉ dành cho giảng viên.');
    } else {
      throw new UnauthorizedException('Không thể xác định danh tính từ kết quả khuôn mặt');
    }

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