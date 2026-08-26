import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SsoExchangeDto } from './dto/sso-exchange.dto';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailService } from '../mail/mail.service';
import { AllowedDomainsService } from '../allowed-domains/allowed-domains.service';
import { SupabaseIdentityService } from './supabase-identity.service';

/** Postgres unique_violation — ดู AuthService.findOrProvisionSsoUser */
const PG_UNIQUE_VIOLATION = '23505';

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
    @InjectRepository(Employee) private employeesRepo: Repository<Employee>,
    private jwtService: JwtService,
    private config: ConfigService,
    private jwtStrategy: JwtStrategy,
    private mailService: MailService,
    private allowedDomainsService: AllowedDomainsService,
    private supabaseIdentity: SupabaseIdentityService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({ where: { username: dto.username } });
    // passwordHash เป็น null สำหรับบัญชีที่ login ผ่าน Microsoft SSO เท่านั้น (Supabase Auth) — ไม่มีรหัสผ่านในระบบนี้
    if (!user || !user.isActive || !user.passwordHash) {
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

  /**
   * แลก Supabase access token (ได้จาก frontend หลัง login ผ่าน Microsoft SSO) เป็น JWT ของระบบเราเอง
   * ตรวจ identity ผ่าน Supabase เอง (SupabaseIdentityService) ไม่เชื่อ claim ใน token ตรงๆ —
   * ป้องกันกรณีมีคนสมัคร Supabase Auth ตรงด้วยอีเมลที่ปลอมโดเมนให้ตรง allowlist (ไม่ได้ผ่าน Microsoft จริง)
   */
  async loginWithSso(dto: SsoExchangeDto) {
    const identity = await this.supabaseIdentity.verifyAccessToken(dto.accessToken);

    if (identity.provider !== 'azure') {
      throw new UnauthorizedException('รองรับเฉพาะ login ผ่าน Microsoft SSO เท่านั้น');
    }

    const email = identity.email?.toLowerCase();
    if (!email) throw new UnauthorizedException('ไม่พบอีเมลจากบัญชี Microsoft');

    // เช็ค allowlist ทุกครั้งที่ login (ไม่ใช่แค่ตอนสร้างบัญชีครั้งแรก) เพื่อให้ถอดโดเมนออกจาก allowlist
    // ภายหลังมีผลปิดกั้น login รอบถัดไปได้จริง
    const domainAllowed = await this.allowedDomainsService.isDomainAllowed(email);
    if (!domainAllowed) {
      throw new UnauthorizedException('โดเมนอีเมลนี้ไม่ได้รับอนุญาตให้ login ผ่าน Microsoft SSO');
    }

    const user = await this.findOrProvisionSsoUser(identity.supabaseUserId, email);
    if (!user.isActive) throw new UnauthorizedException('บัญชีนี้ถูกระงับการใช้งาน');

    return this.issueTokens(user);
  }

  /**
   * หา user ที่ผูกกับ Supabase identity นี้อยู่แล้ว ไม่เจอค่อย link เข้ากับบัญชี local เดิมที่ตรงอีเมล/username
   * (ถ้ามี) หรือสร้างใหม่ พร้อม link employeeId จาก employees.email ที่ตรงกัน
   *
   * บัญชีที่สร้างใหม่ "ต้อง" ผูกกับ employee ได้เท่านั้น (fail closed) — ไม่งั้นจะได้ user ที่ login ผ่านได้
   * แต่ permissions/roles ว่างเปล่า (มาจาก employee.employeeRoles) แล้วโดน 403 ทุก endpoint แบบไม่มีคำอธิบาย
   * ให้ตัดจบตรงนี้เลยว่ายังไม่มีข้อมูลพนักงานรองรับ ดีกว่าปล่อยให้ authenticate สำเร็จแล้วใช้งานไม่ได้
   *
   * ครอบ try/catch unique-violation ไว้ เพราะ login รอบแรกอาจมีหลาย request มาพร้อมกัน (frontend ยิงซ้ำ)
   */
  private async findOrProvisionSsoUser(supabaseUserId: string, email: string): Promise<User> {
    const existing = await this.usersRepo.findOne({ where: { supabaseUserId } });
    if (existing) return existing;

    const linkTarget = await this.usersRepo.findOne({ where: [{ email }, { username: email }] });

    let toSave: User;
    if (linkTarget) {
      toSave = linkTarget;
    } else {
      const employee = await this.employeesRepo.findOne({ where: { email } });
      if (!employee) {
        throw new UnauthorizedException(
          'ไม่พบข้อมูลพนักงานที่ผูกกับอีเมลนี้ในระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มข้อมูลพนักงานก่อน login ผ่าน Microsoft SSO',
        );
      }
      toSave = this.usersRepo.create({
        username: email,
        email,
        isActive: true,
        mustChangePassword: false,
        employeeId: employee.employeeId,
      });
    }
    toSave.supabaseUserId = supabaseUserId;

    try {
      return await this.usersRepo.save(toSave);
    } catch (err) {
      if (err?.code !== PG_UNIQUE_VIOLATION) throw err;

      // อีก request คู่ขนานสร้าง/link ไปสำเร็จก่อนแล้ว — ดึงตัวนั้นมาใช้แทน
      const raceWinner = await this.usersRepo.findOne({ where: { supabaseUserId } });
      if (raceWinner) return raceWinner;

      // ไม่ใช่ race ของ supabaseUserId — เช่น employeeId ที่ auto-link ไปนั้นถูกผูกกับ user อื่นไปแล้วพอดี
      throw new ConflictException('ไม่สามารถสร้างบัญชีสำหรับ Microsoft SSO ได้ (ข้อมูลชนกัน) กรุณาติดต่อผู้ดูแลระบบ');
    }
  }

  async logout(userId: number) {
    await this.usersRepo.update({ userId }, { refreshTokenHash: null });
    return { success: true };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.usersRepo.findOne({ where: { userId } });
    if (!user) throw new UnauthorizedException();

    // บัญชี Microsoft SSO ล้วน (ไม่เคยตั้งรหัสผ่านในระบบนี้) ไม่มีอะไรให้เทียบ "รหัสผ่านปัจจุบัน" ได้
    if (!user.passwordHash) throw new UnauthorizedException('บัญชีนี้ login ผ่าน Microsoft SSO ไม่สามารถเปลี่ยนรหัสผ่านที่นี่ได้');

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
