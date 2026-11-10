import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CachedAuthUser as ValidatedUser, PermissionCacheService } from '../../roles-permissions/permission-cache.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  // ผลลัพธ์ของ validate() แคชไว้ใน PermissionCacheService (TTL 30s) — การเปลี่ยน role/สิทธิ์ล้างแคชให้ทันที
  // ส่วนอื่นที่ไม่ได้ล้าง (เช่น isActive) ยังเพี้ยนได้สูงสุด 30 วินาทีหลังถูกแก้ที่ต้นทาง
  constructor(
    config: ConfigService,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private permissionCache: PermissionCacheService,
  ) {
    super({
      // ต้องรับ token จาก query param ด้วย เพราะ browser EventSource (ใช้กับ /notifications/stream)
      // ตั้ง header เองไม่ได้ — ยัง verify signature/expiry เหมือนเดิมทุกประการ แค่เพิ่มช่องทางอ่าน token
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('access_token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  // หมายเหตุ: login ผ่าน Microsoft SSO (Supabase Auth) ก็จบด้วย token ที่ผ่านตรงนี้เหมือนกัน —
  // AuthService.loginWithSso() แลก Supabase token เป็น JWT ของระบบเราเองใน issueTokens() ก่อนแล้ว
  // ที่นี่จึงไม่ต้องรู้จัก/verify Supabase token เลย (ดู AuthService.loginWithSso, SupabaseIdentityService)
  async validate(payload: { sub: number; username: string }): Promise<ValidatedUser> {
    const cached = this.permissionCache.get(payload.sub);
    if (cached) return cached;

    const user = await this.usersRepo.findOne({
      where: { userId: payload.sub },
      relations: ['employee', 'employee.employeeRoles', 'employee.employeeRoles.role', 'employee.employeeRoles.role.rolePermissions', 'employee.employeeRoles.role.rolePermissions.permission'],
    });
    if (!user || !user.isActive) throw new UnauthorizedException('บัญชีนี้ถูกระงับการใช้งาน');

    const permissions = new Set<string>();
    const roles = new Set<string>();
    for (const er of user.employee?.employeeRoles || []) {
      if (er.role?.roleName) roles.add(er.role.roleName);
      for (const rp of er.role?.rolePermissions || []) {
        permissions.add(rp.permission.permissionCode);
      }
    }

    const value: ValidatedUser = {
      userId: user.userId,
      username: user.username,
      employeeId: user.employeeId,
      permissions: Array.from(permissions),
      roles: Array.from(roles),
      mustChangePassword: user.mustChangePassword,
    };
    this.permissionCache.set(value);
    return value;
  }

  /** เรียกตอนเปลี่ยนรหัสผ่าน/สิทธิ์ ไม่งั้น mustChangePassword/permissions อาจ stale ได้นานสุด 30s */
  invalidate(userId: number) {
    this.permissionCache.invalidateUser(userId);
  }
}
