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
  @Exclude()
  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Exclude()
  @Column({ name: 'refresh_token_hash', nullable: true, type: 'text' })
  refreshTokenHash: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'employee_id', unique: true, nullable: true })
  employeeId: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
