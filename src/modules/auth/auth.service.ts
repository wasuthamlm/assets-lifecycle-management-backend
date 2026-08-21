import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailService } from '../mail/mail.service';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface CurrentUserPayload {
  userId: number;
  username: string;
  employeeId: number | null;
  permissions: string[];
  roles: string[];
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
    private jwtStrategy: JwtStrategy,
    private mailService: MailService,
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

  async refresh(rawRefreshToken: string) {
    let payload: { sub: number };
    try {
      payload = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('refresh token ไม่ถูกต้องหรือหมดอายุ');
    }

    const user = await this.usersRepo.findOne({ where: { userId: payload.sub } });
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException();

    const valid = await argon2.verify(user.refreshTokenHash, rawRefreshToken);
    if (!valid) throw new UnauthorizedException('refresh token ไม่ถูกต้องหรือหมดอายุ');

    return this.issueTokens(user);
  }

  async logout(userId: number) {
    await this.usersRepo.update({ userId }, { refreshTokenHash: null });
    return { success: true };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.usersRepo.findOne({ where: { userId } });
    if (!user) throw new UnauthorizedException();

    const currentOk = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!currentOk) throw new UnauthorizedException('รหัสผ่านปัจจุบันไม่ถูกต้อง');

    user.passwordHash = await argon2.hash(dto.newPassword);
    user.mustChangePassword = false;
    await this.usersRepo.save(user);
    // ไม่งั้น JwtStrategy cache (TTL 30s) จะยังเห็น mustChangePassword=true อยู่ ทำให้ request ถัดไปโดนกัน
    this.jwtStrategy.invalidate(userId);

    return { success: true };
  }

  /**
   * ตอบ success เสมอไม่ว่าจะเจอ email นี้ในระบบหรือไม่ — กัน user enumeration
   * (ไม่งั้นคนภายนอกใช้ endpoint นี้ไล่เช็คได้ว่าอีเมลไหนมีบัญชีในระบบบ้าง)
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (user && user.isActive) {
      const rawToken = randomBytes(32).toString('hex');
      user.resetPasswordTokenHash = createHash('sha256').update(rawToken).digest('hex');
      user.resetPasswordExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await this.usersRepo.save(user);

      const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
      const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;
      await this.mailService.send(
        user.email,
        'รีเซ็ตรหัสผ่าน',
        `คลิกลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 30 นาที): ${resetLink}\n\nถ้าคุณไม่ได้ขอรีเซ็ตรหัสผ่าน สามารถเพิกเฉยต่ออีเมลนี้ได้`,
      );
    } else {
      this.logger.debug(`ขอรีเซ็ตรหัสผ่านด้วยอีเมลที่ไม่มีในระบบหรือถูกระงับ: ${dto.email}`);
    }

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const user = await this.usersRepo.findOne({ where: { resetPasswordTokenHash: tokenHash } });

    if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
      throw new BadRequestException('ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ');
    }

    user.passwordHash = await argon2.hash(dto.newPassword);
    user.mustChangePassword = false;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    // บังคับ logout ทุก session เดิม เพราะรหัสผ่านเปลี่ยนแล้ว
    user.refreshTokenHash = null;
    await this.usersRepo.save(user);
    this.jwtStrategy.invalidate(user.userId);

    return { success: true };
  }

  async me(currentUser: CurrentUserPayload) {
    const user = await this.usersRepo.findOne({
      where: { userId: currentUser.userId },
      relations: ['employee', 'employee.department'],
    });
    if (!user) throw new UnauthorizedException();

    return {
      userId: user.userId,
      username: user.username,
      email: user.email,
      employeeId: user.employeeId,
      mustChangePassword: user.mustChangePassword,
      permissions: currentUser.permissions,
      roles: currentUser.roles,
      employee: user.employee
        ? {
            employeeId: user.employee.employeeId,
            employeeCode: user.employee.employeeCode,
            fullName: user.employee.fullName,
            position: user.employee.position,
            email: user.employee.email,
            department: user.employee.department
              ? { departmentId: user.employee.department.departmentId, departmentName: user.employee.department.departmentName }
              : null,
          }
        : null,
    };
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

    return { accessToken, refreshToken, mustChangePassword: user.mustChangePassword };
  }
}
