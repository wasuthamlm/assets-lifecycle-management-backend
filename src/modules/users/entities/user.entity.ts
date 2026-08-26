import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '@common/entities/base.entity';
import { Employee } from '../../employees/entities/employee.entity';

/**
 * ตารางนี้ไม่มีใน DBML ต้นฉบับ — เพิ่มเข้ามาเพื่อรองรับ Auth (login)
 * แยก auth credential ออกจาก employees ตามหลัก separation of concerns
 * (employees = ข้อมูลพนักงาน/HR, users = ข้อมูล login)
 * สมมติฐาน: 1 employee ผูกกับ 1 user login (1-1) — ปรับได้ภายหลังหากต้องการ multi-account
 */
@Entity('users')
export class User extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'user_id' })
  userId: number;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true, nullable: true })
  email: string;

  // @Exclude กัน hash หลุดออกไปใน response ทุกจุดที่คืน entity นี้ตรงๆ ผ่าน ClassSerializerInterceptor (ดู main.ts)
  // nullable เพราะ user ที่ login ผ่าน Microsoft SSO (Supabase Auth) ไม่มีรหัสผ่านของระบบเอง
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  // uuid ของ user ใน Supabase Auth (auth.users.id) — มีค่าเฉพาะ user ที่เคย login ผ่าน Microsoft SSO เท่านั้น
  @Column({ name: 'supabase_user_id', type: 'uuid', unique: true, nullable: true })
  supabaseUserId: string | null;

  @Exclude()
  @Column({ name: 'refresh_token_hash', nullable: true, type: 'text' })
  refreshTokenHash: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // true สำหรับ user ที่ยังใช้รหัสผ่านชั่วคราว/ที่ seed ให้ (เช่น admin) — บังคับเปลี่ยนก่อนใช้งานหน้าอื่น
  @Column({ name: 'must_change_password', default: false })
  mustChangePassword: boolean;

  // เก็บ sha256(raw token) เพื่อให้ query หา user จาก token ที่ผู้ใช้ส่งกลับมาได้ตรงๆ (ต่างจาก refreshTokenHash
  // ที่ใช้ argon2 เพราะที่นั่น verify เทียบกับ userId ที่รู้อยู่แล้วจาก JWT payload — ที่นี่ยังไม่รู้ userId ล่วงหน้า)
  @Exclude()
  @Column({ name: 'reset_password_token_hash', type: 'varchar', nullable: true })
  resetPasswordTokenHash: string | null;

  @Exclude()
  @Column({ name: 'reset_password_expires_at', type: 'timestamp', nullable: true })
  resetPasswordExpiresAt: Date | null;

  @Column({ name: 'employee_id', unique: true, nullable: true })
  employeeId: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
