import { Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { Department } from '../../departments/entities/department.entity';
import { EmployeeRole } from '../../roles-permissions/entities/employee-role.entity';

@Entity('employees')
export class Employee extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'employee_id' })
  employeeId: number;

  // null ได้ — พนักงานที่กรอกโปรไฟล์เองตอน login SSO ครั้งแรกอาจยังไม่มีรหัส HR ค่อยเติมให้ทีหลัง
  @Column({ type: 'varchar', unique: true, nullable: true })
  employeeCode: string | null;

  @Column()
  fullName: string;

  @Column({ name: 'department_id', nullable: true })
  @Index('IDX_employees_department_id')
  departmentId: number;

  @ManyToOne(() => Department, (d) => d.employees, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ nullable: true })
  position: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  /**
   * LINE userId (sub ของ LIFF ID token) — ผูกครั้งแรกผ่าน POST /line/link หลัง login ปกติ
   * ใช้ระบุตัวผู้แจ้งจากฟอร์ม LIFF และ push สถานะ ticket กลับทาง LINE
   */
  @Column({ name: 'line_user_id', type: 'varchar', length: 64, unique: true, nullable: true })
  lineUserId: string | null;

  @OneToMany(() => EmployeeRole, (er) => er.employee)
  employeeRoles: EmployeeRole[];
}
