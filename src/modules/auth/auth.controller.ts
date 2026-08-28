import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SsoExchangeDto } from './dto/sso-exchange.dto';
import { CompleteEmployeeProfileDto } from './dto/complete-employee-profile.dto';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AllowPendingPasswordChange } from '@common/decorators/allow-pending-password-change.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // จำกัดถี่กว่าค่า default ของทั้งระบบ กัน brute-force รหัสผ่าน: 5 ครั้ง / นาที ต่อ IP
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  // จำกัดถี่เหมือน login กัน enumeration/spam อีเมล
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // login ผ่าน Microsoft SSO: frontend ทำ OAuth flow กับ Supabase เอง แล้วส่ง access token ที่ได้มาแลกเป็น
  // JWT ของระบบเราต่อที่นี่ (ดู AuthService.loginWithSso)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('sso/exchange')
  ssoExchange(@Body() dto: SsoExchangeDto) {
    return this.authService.loginWithSso(dto);
  }

  @AllowPendingPasswordChange()
  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  logout(@CurrentUser() user) {
    return this.authService.logout(user.userId);
  }

  @AllowPendingPasswordChange()
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@CurrentUser() user) {
    return this.authService.me(user);
  }

  // ไม่ต้องมี @RequirePermissions — ทำกับบัญชีตัวเองเท่านั้น เหมือน /auth/me
  @AllowPendingPasswordChange()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @Patch('change-password')
  changePassword(@CurrentUser() user, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }

  // ให้ user ที่ login ผ่าน Microsoft SSO แล้วยังไม่มี employee ผูกอยู่ กรอกข้อมูลพนักงานของตัวเองครั้งแรก
  // ไม่ต้องมี @RequirePermissions เหมือนกัน — ทำกับบัญชีตัวเองเท่านั้น (ดู AuthService.completeEmployeeProfile)
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @Post('me/employee-profile')
  completeEmployeeProfile(@CurrentUser() user, @Body() dto: CompleteEmployeeProfileDto) {
    return this.authService.completeEmployeeProfile(user.userId, dto);
  }
}
