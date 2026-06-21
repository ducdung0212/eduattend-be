import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

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
    return {
      access_token: await this.jwtService.signAsync(payload),
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
}