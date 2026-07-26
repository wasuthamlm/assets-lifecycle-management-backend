import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';

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
    // decode ตัว refresh token เองแบบง่าย เพื่อดึง userId (ไม่ verify signature ซ้ำที่นี่ เพราะ service verify ผ่าน hash เทียบอยู่แล้ว)
    let payload: any;
    try {
      const [, payloadSegment] = dto.refreshToken.split('.');
      payload = JSON.parse(Buffer.from(payloadSegment, 'base64').toString());
    } catch {
      throw new BadRequestException('refreshToken รูปแบบไม่ถูกต้อง');
    }
    if (!payload || typeof payload.sub !== 'number') {
      throw new BadRequestException('refreshToken รูปแบบไม่ถูกต้อง');
    }
    return this.authService.refresh(payload.sub, dto.refreshToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  logout(@CurrentUser() user) {
    return this.authService.logout(user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@CurrentUser() user) {
    return this.authService.me(user);
  }
}
