import { Controller, Post, Body, HttpCode, HttpStatus, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }
  @Get('hash')
  async createHash() {
    const hashed = await bcrypt.hash('123456', 10); // Đổi thành 123456
    return { newPasswordHash: hashed };
  }
}