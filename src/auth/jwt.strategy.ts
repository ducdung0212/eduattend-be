import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as dotenv from 'dotenv'; 

dotenv.config(); 

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!, // Phải khớp với JWT_SECRET trong .env
    });
  }

  // Hàm này tự động chạy nếu token hợp lệ
  async validate(payload: any) {
    // request.user giờ đây sẽ mang đầy đủ cả mã sinh viên và giảng viên (nếu có)
    return { 
      id: payload.sub, 
      email: payload.email, 
      role: payload.role,
      student_code: payload.student_code,
      lecturer_code: payload.lecturer_code
    };
  }
}