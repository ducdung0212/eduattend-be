import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, LoginFaceDto, RefreshDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChangePassword } from './dto/changePassword.dto';
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

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Body() changePasswordDto: ChangePassword, @Req() req: any) {
    return this.authService.changePassword(req.user.email, changePasswordDto.curPass, changePasswordDto.newPass); 
  }

  @HttpCode(HttpStatus.OK)
  @Post('login-face')
  async loginFace(@Body() loginFaceDto: LoginFaceDto) {
    return this.authService.loginFace(loginFaceDto.imageBase64);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() refreshDto: RefreshDto) {
    return this.authService.refreshToken(refreshDto.refresh_token);
  }
}