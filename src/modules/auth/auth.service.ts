import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SsoExchangeDto } from './dto/sso-exchange.dto';
import { CompleteEmployeeProfileDto } from './dto/complete-employee-profile.dto';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailService } from '../mail/mail.service';
import { AllowedDomainsService } from '../allowed-domains/allowed-domains.service';
import { SupabaseIdentityService } from './supabase-identity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RolePreassignmentsService } from '../roles-permissions/role-preassignments.service';
import { NotificationType } from '@common/enums';

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
    private notificationsService: NotificationsService,
    @InjectRepository(Department) private departmentsRepo: Repository<Department>,
    private rolePreassignments: RolePreassignmentsService,
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

    const user = await this.findOrProvisionSsoUser(identity.supabaseUserId, email, identity.fullName);
    if (!user.isActive) throw new UnauthorizedException('บัญชีนี้ถูกระงับการใช้งาน');

    return this.issueTokens(user);
  }

  /**
   * หา user ที่ผูกกับ Supabase identity นี้อยู่แล้ว ไม่เจอค่อย link เข้ากับบัญชี local เดิมที่ตรงอีเมล/username
   * (ถ้ามี) หรือสร้างใหม่ พร้อมพยายาม auto-link employeeId จาก employees.email ที่ตรงกัน (ถ้ามี)
   *
   * ไม่ fail-closed ตอนหา employee ไม่เจอ — login ผ่านได้เสมอตราบใดที่ผ่าน Azure AD + โดเมนจริง (isDomainAllowed
   * เช็คใน loginWithSso ก่อนเรียกฟังก์ชันนี้แล้ว) ผลคือถ้ายังไม่มี employee record ตรงกัน user จะ login เข้าได้
   * แต่ permissions/roles ว่างเปล่าจนกว่าจะกรอกโปรไฟล์ (completeEmployeeProfile) หรือ admin ผูก employeeId ให้
   *
   * user เดิมที่ยังไม่มี employeeId จะถูกลอง auto-link ใหม่ทุกครั้งที่ login เผื่อ HR เพิ่งสร้าง employee อีเมลนี้ทีหลัง
   * และทุกครั้งที่ผูก employee สำเร็จจะใส่ role ที่ admin กำหนดล่วงหน้าให้อีเมลนี้ไว้ (RolePreassignmentsService)
   *
   * ครอบ try/catch unique-violation ไว้ เพราะ login รอบแรกอาจมีหลาย request มาพร้อมกัน (frontend ยิงซ้ำ)
   */
  private async findOrProvisionSsoUser(supabaseUserId: string, email: string, fullName: string | null): Promise<User> {
    const existing = await this.usersRepo.findOne({ where: { supabaseUserId } });
    if (existing) {
      let dirty = false;
      // sync ชื่อจาก Azure AD ทุก login เผื่อมีการเปลี่ยนชื่อทีหลัง — ไม่เขียนทับด้วย null ถ้ารอบนี้ไม่มีค่าส่งมา
      if (fullName && fullName !== existing.fullName) {
        existing.fullName = fullName;
        dirty = true;
      }

      const lateEmployee = existing.employeeId ? null : await this.findEmployeeByEmail(email);
      const lateEmployeeFree =
        lateEmployee && !(await this.usersRepo.findOne({ where: { employeeId: lateEmployee.employeeId } }));
      if (lateEmployee && lateEmployeeFree) {
        existing.employeeId = lateEmployee.employeeId;
        dirty = true;
      }

      const saved = dirty ? await this.usersRepo.save(existing) : existing;
      if (lateEmployee && lateEmployeeFree) await this.applyPreassignedRoles(saved, email, lateEmployee.employeeId);
      return saved;
    }

    const linkTarget = await this.usersRepo.findOne({ where: [{ email }, { username: email }] });
    const employee = linkTarget ? null : await this.findEmployeeByEmail(email);

    const toSave =
      linkTarget ??
      this.usersRepo.create({
        username: email,
        email,
        isActive: true,
        mustChangePassword: false,
        employeeId: employee?.employeeId ?? undefined,
      });
    toSave.supabaseUserId = supabaseUserId;
    if (fullName && !toSave.fullName) toSave.fullName = fullName;

    try {
      const saved = await this.usersRepo.save(toSave);
      if (employee) await this.applyPreassignedRoles(saved, email, employee.employeeId);
      return saved;
    } catch (err) {
      if (err?.code !== PG_UNIQUE_VIOLATION) throw err;

      // อีก request คู่ขนานสร้าง/link ไปสำเร็จก่อนแล้ว — ดึงตัวนั้นมาใช้แทน
      const raceWinner = await this.usersRepo.findOne({ where: { supabaseUserId } });
      if (raceWinner) return raceWinner;

      // ไม่ใช่ race ของ supabaseUserId — เช่น employeeId ที่ auto-link ไปนั้นถูกผูกกับ user อื่นไปแล้วพอดี
      throw new ConflictException('ไม่สามารถสร้างบัญชีสำหรับ Microsoft SSO ได้ (ข้อมูลชนกัน) กรุณาติดต่อผู้ดูแลระบบ');
    }
  }

  /** employees.email ไม่ได้บังคับตัวพิมพ์เล็ก (HR กรอกเอง) ส่วนอีเมลจาก Azure AD lowercase แล้ว — เทียบแบบไม่สนตัวพิมพ์ */
  private findEmployeeByEmail(email: string) {
    return this.employeesRepo.findOne({ where: { email: Raw((alias) => `lower(${alias}) = :email`, { email }) } });
  }

  /**
   * ใส่ role ที่ admin กำหนดล่วงหน้าให้อีเมลนี้ (ถ้ามี) หลังผูก employee สำเร็จ คืนจำนวน role ที่ใส่ไป
   * best-effort: การผูก employee สำเร็จไปแล้ว ห้ามให้ขั้นนี้พังแล้วทำให้ login/กรอกโปรไฟล์ล้มทั้งหมด —
   * ถ้าพังก็แค่ไม่ได้ role อัตโนมัติ admin ยังกำหนดเองทีหลังได้เหมือนเดิม
   */
  private async applyPreassignedRoles(user: User, email: string | null, employeeId: number): Promise<number> {
    try {
      const applied = await this.rolePreassignments.consumeForEmployee(email, employeeId);
      if (applied.length) this.jwtStrategy.invalidate(user.userId);
      return applied.length;
    } catch (err) {
      this.logger.warn(`ใส่ role ที่กำหนดล่วงหน้าให้ ${email} ไม่สำเร็จ: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * ให้ user ที่ login ผ่าน Microsoft SSO แล้วยังไม่มี employee ผูกอยู่ (employeeId เป็น null) กรอกข้อมูล
   * พนักงานของตัวเองเพื่อสร้าง employee record ครั้งแรก — ทำได้แค่ครั้งเดียวต่อบัญชี (ไม่ใช่ endpoint แก้ไขทั่วไป
   * ดู EmployeesController.update สำหรับแก้ไขข้อมูลพนักงานที่มีอยู่แล้ว ซึ่งต้องมีสิทธิ์ employee.update)
   *
   * ข้อมูลที่ user กรอกเองไม่มีผลต่อสิทธิ์เลย — role ที่ได้มาจากที่ admin กำหนดล่วงหน้าผูกกับอีเมลของบัญชี
   * (อีเมลที่ Azure AD ยืนยันแล้ว ไม่ใช่ที่ user พิมพ์) ถ้าไม่มีกำหนดไว้ก็ยังต้องรอ admin assign role ให้ทีหลังเหมือนเดิม
   * กรอกข้อมูลผิดจึงมีผลแค่ข้อมูล HR คลาดเคลื่อน ไม่กระทบสิทธิ์การเข้าถึง
   */
  async completeEmployeeProfile(userId: number, dto: CompleteEmployeeProfileDto) {
    const user = await this.usersRepo.findOne({ where: { userId } });
    if (!user) throw new UnauthorizedException();
    if (user.employeeId) {
      throw new ConflictException('บัญชีนี้ผูกกับข้อมูลพนักงานอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบหากต้องการแก้ไข');
    }

    const existingCode = await this.employeesRepo.findOne({ where: { employeeCode: dto.employeeCode } });
    if (existingCode) {
      if (!(await this.canClaimEmployee(existingCode, user, dto))) {
        throw new ConflictException('รหัสพนักงานนี้ถูกใช้ไปแล้ว');
      }
      return this.claimEmployee(existingCode, user, dto);
    }

    const departmentId = await this.resolveDepartmentId(dto);

    const employee = await this.employeesRepo.save(
      this.employeesRepo.create({
        employeeCode: dto.employeeCode,
        fullName: dto.fullName,
        departmentId,
        position: dto.position,
        phone: dto.phone,
        email: user.email,
      }),
    );

    user.employeeId = employee.employeeId;
    await this.usersRepo.save(user);
    this.jwtStrategy.invalidate(userId);

    // มี role กำหนดล่วงหน้าแล้วก็ไม่ต้องรบกวน admin ให้มากำหนดสิทธิ์อีก
    const appliedRoles = await this.applyPreassignedRoles(user, user.email, employee.employeeId);
    if (appliedRoles === 0) await this.notifyAdminsOfNewEmployeeProfile(employee);

    return { success: true };
  }

  /**
   * พนักงานใหม่ที่ HR สร้างไว้ล่วงหน้าตอนเบิกอุปกรณ์ให้ (ยังไม่มีเมล — ดู RequisitionsService.create newEmployee)
   * ผูกกับบัญชีที่ login ครั้งแรกได้เมื่อ: ยังไม่มีบัญชีไหนผูกอยู่, อีเมลว่างหรือตรงกับบัญชี และชื่อตรงกับที่ HR กรอก
   * ต้องตรงทั้งรหัสและชื่อ กันคนเดารหัสพนักงานแล้วสวมรอยเอาข้อมูล/อุปกรณ์ของคนอื่น
   */
  private async canClaimEmployee(employee: Employee, user: User, dto: CompleteEmployeeProfileDto): Promise<boolean> {
    const normalizeName = (name: string | null | undefined) => (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (normalizeName(employee.fullName) !== normalizeName(dto.fullName)) return false;
    if (employee.email && employee.email.toLowerCase() !== user.email?.toLowerCase()) return false;
    const owner = await this.usersRepo.findOne({ where: { employeeId: employee.employeeId } });
    return !owner;
  }

  private async claimEmployee(employee: Employee, user: User, dto: CompleteEmployeeProfileDto) {
    // เติมเฉพาะช่องที่ HR ยังไม่ได้กรอก — ข้อมูลที่ HR กรอกไว้ถือเป็นข้อมูลหลัก ไม่ให้ user เขียนทับ
    employee.email = user.email;
    if (!employee.position && dto.position) employee.position = dto.position;
    if (!employee.phone && dto.phone) employee.phone = dto.phone;
    if (!employee.departmentId) {
      const departmentId = await this.resolveDepartmentId(dto);
      if (departmentId) employee.departmentId = departmentId;
    }
    await this.employeesRepo.save(employee);

    user.employeeId = employee.employeeId;
    await this.usersRepo.save(user);
    this.jwtStrategy.invalidate(user.userId);

    const appliedRoles = await this.applyPreassignedRoles(user, user.email, employee.employeeId);
    // แจ้ง admin ทุกครั้งที่ผูกกับข้อมูลเดิม ให้ตรวจได้ว่าผูกถูกคน
    await this.notifyAdminsOfNewEmployeeProfile(
      employee,
      appliedRoles > 0 ? 'พนักงานใหม่เข้าสู่ระบบแล้ว' : 'มีพนักงานใหม่รอกำหนดสิทธิ์',
      `${employee.fullName} (${employee.employeeCode}) login ครั้งแรกด้วย ${user.email} และผูกกับข้อมูลพนักงานที่ HR สร้างไว้แล้ว` +
        (appliedRoles > 0 ? ' (ได้รับ role ตามที่กำหนดล่วงหน้า)' : ' กรุณาตรวจสอบและกำหนดบทบาท/สิทธิ์ให้'),
    );

    return { success: true };
  }

  /**
   * ถ้า user พิมพ์แผนกใหม่มา (newDepartmentName) — reuse แผนกที่ชื่อตรงกันอยู่แล้ว (ไม่สนตัวพิมพ์เล็กใหญ่/เว้นวรรคหัวท้าย
   * กันสร้างซ้ำซ้อนเวลาหลายคนพิมพ์ชื่อเดียวกัน) ถ้าไม่เจอค่อยสร้างใหม่ — ให้ความสำคัญกว่า departmentId ที่ส่งมาด้วยกัน
   */
  private async resolveDepartmentId(dto: CompleteEmployeeProfileDto): Promise<number | undefined> {
    const name = dto.newDepartmentName?.trim();
    if (!name) return dto.departmentId;

    const existing = await this.departmentsRepo
      .createQueryBuilder('d')
      .where('lower(d.departmentName) = lower(:name)', { name })
      .getOne();
    if (existing) return existing.departmentId;

    const created = await this.departmentsRepo.save(this.departmentsRepo.create({ departmentName: name }));
    return created.departmentId;
  }

  /**
   * แจ้งเตือนคนที่มี role it_admin (ผู้ดูแลระบบ IT) ว่ามี user กรอกข้อมูลพนักงานของตัวเองเสร็จแล้ว
   * เพื่อเตือนให้ไปกำหนด role ให้ต่อ — ไม่งั้น user คนนี้ login เข้ามาได้แต่ permissions ยังว่างเปล่าอยู่ดี
   * (ดู completeEmployeeProfile) best-effort เหมือน NotificationsService.notify() เอง ห้ามให้ล้มเหลวตรงนี้
   * ทำให้การผูก employee ที่สำเร็จไปแล้วก่อนหน้ากลายเป็น error กับ caller
   */
  private async notifyAdminsOfNewEmployeeProfile(
    employee: Employee,
    title = 'มีพนักงานใหม่รอกำหนดสิทธิ์',
    message = `${employee.fullName} (${employee.employeeCode}) กรอกข้อมูลพนักงานของตัวเองเสร็จแล้วหลัง login ครั้งแรก กรุณากำหนดบทบาท/สิทธิ์ให้`,
  ) {
    try {
      const admins = await this.employeesRepo
        .createQueryBuilder('e')
        .innerJoin('e.employeeRoles', 'er')
        .innerJoin('er.role', 'r')
        .where('r.roleName = :roleName', { roleName: 'it_admin' })
        .getMany();

      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.notify(
            admin.employeeId,
            NotificationType.EMPLOYEE_PROFILE_COMPLETED,
            title,
            message,
            'employee',
            employee.employeeId,
          ),
        ),
      );
    } catch (err) {
      this.logger.warn(`แจ้งเตือน admin เรื่อง employee profile ใหม่ไม่สำเร็จ: ${(err as Error).message}`);
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
      // ชื่อพนักงานตัวจริง (HR) มาก่อนเสมอถ้ามี ไม่งั้น fallback ไปใช้ชื่อจาก Azure AD ที่ sync ไว้ตอน login SSO
      // (ดู findOrProvisionSsoUser) — frontend ค่อย fallback ไป email เองอีกชั้นถ้าทั้งคู่เป็น null
      fullName: user.employee?.fullName ?? user.fullName,
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
            phone: user.employee.phone,
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
