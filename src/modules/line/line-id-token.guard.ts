import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { LineAuthService } from './line-auth.service';

export const LINE_ID_TOKEN_HEADER = 'x-line-id-token';
/** message ที่ frontend (หน้า LIFF) ใช้ตัดสินใจพาไปหน้า "เชื่อมบัญชี" */
export const LINE_NOT_LINKED = 'LINE_NOT_LINKED';

/**
 * LINE userId → สิทธิ์ของพนักงานที่ผูกไว้ (ชุดเดียวกับตอน login เว็บ) — null = ยังไม่ผูก
 * ใช้ทั้ง LineIdTokenGuard (หน้า LIFF) และแชทบอท (webhook)
 */
export async function resolveLineUser(
  users: Repository<User>,
  jwtStrategy: JwtStrategy,
  lineUserId: string,
): Promise<Awaited<ReturnType<JwtStrategy['validate']>> | null> {
  const user = await users.findOne({
    where: { employee: { lineUserId } },
    relations: ['employee'],
    select: { userId: true, username: true, employee: { employeeId: true } },
  });
  if (!user) return null;
  return jwtStrategy.validate({ sub: user.userId, username: user.username });
}

/**
 * ใช้แทน JWT สำหรับหน้า LIFF — route ต้องเป็น @Public() เพื่อข้าม JwtAuthGuard แบบ global
 * ตรวจ LINE ID token → หาพนักงานที่ผูก line_user_id ไว้ → สร้าง req.user ด้วยสิทธิ์ชุดเดียวกับตอน login เว็บ
 * (เรียก JwtStrategy.validate ตรงๆ จึงได้ permission/role/isActive ตามจริงและใช้แคชเดียวกัน)
 *
 * หมายเหตุ: PermissionsGuard แบบ global ทำงานก่อน guard ระดับ controller นี้ ตอนนั้นยังไม่มี req.user
 * route ที่ใช้ guard นี้จึงห้ามใช้ @RequirePermissions — ให้เช็คสิทธิ์เองใน controller (ดู LineLiffController)
 */
@Injectable()
export class LineIdTokenGuard implements CanActivate {
  constructor(
    private lineAuth: LineAuthService,
    private jwtStrategy: JwtStrategy,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const idToken = req.headers[LINE_ID_TOKEN_HEADER];
    if (!idToken || typeof idToken !== 'string') throw new UnauthorizedException('ไม่พบ LINE ID token');

    const lineUserId = await this.lineAuth.verifyIdToken(idToken);
    const payload = await resolveLineUser(this.users, this.jwtStrategy, lineUserId);
    if (!payload) throw new ForbiddenException(LINE_NOT_LINKED);
    if (payload.mustChangePassword) {
      throw new ForbiddenException('ต้องเปลี่ยนรหัสผ่านในเว็บก่อน จึงจะแจ้งปัญหาผ่าน LINE ได้');
    }
    req.user = payload;
    req.lineUserId = lineUserId;
    return true;
  }
}
