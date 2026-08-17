import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChangePassword } from './dto/changePassword.dto';
import { normalizeIp } from '../utils/normalize-ip';
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

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

  @HttpCode(HttpStatus.CREATED)
  @Post('liveness-session')
  async createLivenessSession() {
    return this.authService.createLivenessSession();
  }

  @HttpCode(HttpStatus.OK)
  @Post('liveness-login')
  async loginLiveness(@Body('sessionId') sessionId: string, @Req() req: any) {
    const ip = normalizeIp(req.ip || req.connection?.remoteAddress);
    console.log(`[livenessLogin] Authenticating for IP: ${ip} with session: ${sessionId}`);
    return this.authService.loginLiveness(sessionId, ip);
  }

  @Get('check-face-lock')
  checkFaceLock(@Req() req: any) {
    const ip = normalizeIp(req.ip || req.connection?.remoteAddress);
    console.log(`[checkFaceLock] Checking lock for IP: ${ip}`);
    return this.authService.checkFaceLock(ip);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() refreshDto: RefreshDto) {
    return this.authService.refreshToken(refreshDto.refresh_token);
  }
}