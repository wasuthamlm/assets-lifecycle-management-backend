import { Injectable } from '@nestjs/common';

export interface CachedAuthUser {
  userId: number;
  username: string;
  employeeId: number | null;
  permissions: string[];
  roles: string[];
  mustChangePassword: boolean;
}

const CACHE_TTL_MS = 30_000;

/**
 * แคชผลลัพธ์ของ JwtStrategy.validate() ต่อ userId สั้นๆ กันการ join 4 ชั้น (employee->role->rolePermission->permission)
 * ทุก request — แยกออกมาจาก JwtStrategy เพื่อให้ RolesPermissionsService ล้างแคชได้ทันทีที่สิทธิ์เปลี่ยน
 * (AuthModule import RolesPermissionsModule อยู่แล้ว ถ้าให้ RolesPermissionsService inject JwtStrategy ตรงๆ จะวนกัน)
 * ไม่งั้น user ที่เพิ่งถูกเปลี่ยน role จะยังได้สิทธิ์เดิมจาก /auth/me และ guard ไปอีกนานสุด 30 วินาที
 */
@Injectable()
export class PermissionCacheService {
  private cache = new Map<number, { value: CachedAuthUser; expiresAt: number }>();

  get(userId: number): CachedAuthUser | null {
    const cached = this.cache.get(userId);
    return cached && cached.expiresAt > Date.now() ? cached.value : null;
  }

  set(value: CachedAuthUser) {
    this.cache.set(value.userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  invalidateUser(userId: number) {
    this.cache.delete(userId);
  }

  /** role ของพนักงานคนนี้เปลี่ยน — แคชผูกกับ userId จึงหาเอาจาก employeeId ที่เก็บอยู่ในค่าแคช ไม่ต้องยิง DB */
  invalidateEmployee(employeeId: number) {
    for (const [userId, { value }] of this.cache) {
      if (value.employeeId === employeeId) this.cache.delete(userId);
    }
  }

  /** permission ของ role เปลี่ยน — กระทบทุกคนที่ถือ role นั้น ล้างทั้งหมดง่ายกว่าและถูกพอ (แค่ query ใหม่รอบเดียวต่อคน) */
  clear() {
    this.cache.clear();
  }
}
