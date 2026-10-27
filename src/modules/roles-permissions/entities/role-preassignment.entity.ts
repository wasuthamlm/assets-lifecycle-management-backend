import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';

/**
 * role ที่ admin กำหนดไว้ล่วงหน้าให้อีเมลหนึ่ง (ยังไม่มีบัญชี/ข้อมูลพนักงาน) — ไม่ได้สร้างบัญชีให้
 * พอเจ้าของอีเมลนี้ login ผ่าน Microsoft SSO แล้วถูกผูกกับ employee (กรอกโปรไฟล์เอง หรือ auto-link จาก
 * employees.email) ระบบจะใส่ role ชุดนี้ให้แล้วลบแถวนี้ทิ้ง (ดู RolePreassignmentsService.consumeForEmployee)
 */
@Entity('role_preassignments')
export class RolePreassignment extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'role_preassignment_id' })
  rolePreassignmentId: number;

  /** เก็บเป็นตัวพิมพ์เล็กเสมอ — เทียบกับอีเมลจาก Azure AD ที่ lowercase แล้วใน AuthService.loginWithSso */
  @Column({ unique: true })
  email: string;

  @Column({ type: 'int', array: true })
  roleIds: number[];

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: number;
}
