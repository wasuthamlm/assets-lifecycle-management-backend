import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({ where: { username: dto.username } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('username หรือ password ไม่ถูกต้อง');
    }

    const passwordOk = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedException('username หรือ password ไม่ถูกต้อง');
    }

    return this.issueTokens(user);
  }

  async refresh(userId: number, rawRefreshToken: string) {
    const user = await this.usersRepo.findOne({ where: { userId } });
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException();

    const valid = await argon2.verify(user.refreshTokenHash, rawRefreshToken);
    if (!valid) throw new UnauthorizedException('refresh token ไม่ถูกต้องหรือหมดอายุ');

    return this.issueTokens(user);
  }

  async logout(userId: number) {
    await this.usersRepo.update({ userId }, { refreshTokenHash: null });
    return { success: true };
  }

  private async issueTokens(user: User) {
    const payload = { sub: user.userId, username: user.username };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') || '15m',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    user.refreshTokenHash = await argon2.hash(refreshToken);
    await this.usersRepo.save(user);

    return { accessToken, refreshToken };
  }
}
