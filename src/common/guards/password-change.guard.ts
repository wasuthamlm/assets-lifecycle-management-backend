import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-pending-password-change.decorator';

/**
 * ปิดกั้นทุก endpoint ที่ต้อง login (ยกเว้นที่ประกาศ @AllowPendingPasswordChange()) ถ้า user
 * ยังใช้รหัสผ่านชั่วคราวอยู่ (mustChangePassword=true) — กันไม่ให้ default credential ที่ seed
 * ไว้ (เช่น admin/Admin@12345) ถูกใช้เรียก API จริงได้ก่อนเปลี่ยนรหัสผ่าน แม้จะเรียกตรงผ่าน
 * curl/Swagger ก็ตาม ไม่ใช่แค่ redirect ฝั่ง frontend เท่านั้น
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    const { user } = context.switchToHttp().getRequest();
    // ไม่มี user = route เป็น @Public() (เช่น login) — ไม่เกี่ยวกับ guard นี้
    if (!user) return true;

    if (user.mustChangePassword) {
      throw new ForbiddenException('ต้องเปลี่ยนรหัสผ่านก่อนใช้งานส่วนอื่นของระบบ');
    }
    return true;
  }
}
