import { Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { Department } from '../../departments/entities/department.entity';
import { EmployeeRole } from '../../roles-permissions/entities/employee-role.entity';

@Entity('employees')
export class Employee extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'employee_id' })
  employeeId: number;

  @Column({ unique: true })
  employeeCode: string;

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

  @OneToMany(() => EmployeeRole, (er) => er.employee)
  employeeRoles: EmployeeRole[];
}
