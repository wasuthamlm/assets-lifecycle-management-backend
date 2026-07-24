import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { Company } from '../../companies/entities/company.entity';
import { Employee } from '../../employees/entities/employee.entity';

@Entity('departments')
export class Department extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'department_id' })
  departmentId: number;

  @Column({ name: 'company_id', nullable: true })
  companyId: number;

  @ManyToOne(() => Company, (c) => c.departments, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  departmentName: string;

  @Column({ nullable: true, comment: 'office / factory1 / factory2' })
  site: string;

  @Column({ name: 'parent_department_id', nullable: true })
  parentDepartmentId: number;

  @ManyToOne(() => Department, (d) => d.children, { nullable: true })
  @JoinColumn({ name: 'parent_department_id' })
  parent: Department;

  @OneToMany(() => Department, (d) => d.parent)
  children: Department[];

  @OneToMany(() => Employee, (e) => e.department)
  employees: Employee[];
}
