import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

interface ValidatedUser {
  userId: number;
  username: string;
  employeeId: number | null;
  permissions: string[];
  roles: string[];
  mustChangePassword: boolean;
}

const CACHE_TTL_MS = 30_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  // แคชผลลัพธ์ของ validate() ต่อ userId สั้นๆ กันการ join 4 ชั้น (employee->role->rolePermission->permission)
  // ทุก request — ยอมรับ permission/isActive เพี้ยนได้สูงสุด 30 วินาทีหลังถูกแก้ที่ต้นทาง
  private cache = new Map<number, { value: ValidatedUser; expiresAt: number }>();

  constructor(
    config: ConfigService,
    @InjectRepository(User) private usersRepo: Repository<User>,
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

  async validate(payload: { sub: number; username: string }): Promise<ValidatedUser> {
    const cached = this.cache.get(payload.sub);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

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
    this.cache.set(payload.sub, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** เรียกตอนเปลี่ยนรหัสผ่าน/สิทธิ์ ไม่งั้น mustChangePassword/permissions อาจ stale ได้นานสุด 30s */
  invalidate(userId: number) {
    this.cache.delete(userId);
  }
}
