import { Entity, ManyToOne, JoinColumn, PrimaryColumn, Column } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Role } from './role.entity';

/**
 * Junction table — composite PK (employee_id, role_id)
 * รองรับ 1 คนมีได้หลาย role (แก้จาก employees.role_id เดี่ยวเดิม)
 */
@Entity('employee_roles')
export class EmployeeRole {
  @PrimaryColumn({ name: 'employee_id' })
  employeeId: number;

  @PrimaryColumn({ name: 'role_id' })
  roleId: number;

  @Column({ type: 'date', nullable: true })
  assignedDate: Date;

  @ManyToOne(() => Employee, (e) => e.employeeRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Role, (r) => r.employeeRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;
}
