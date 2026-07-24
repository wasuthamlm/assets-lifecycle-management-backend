import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RolePermission } from './role-permission.entity';
import { EmployeeRole } from './employee-role.entity';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn({ name: 'role_id' })
  roleId: number;

  @Column({ comment: 'employee / admin — ขยาย role ใหม่ได้ในอนาคต' })
  roleName: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions: RolePermission[];

  @OneToMany(() => EmployeeRole, (er) => er.role)
  employeeRoles: EmployeeRole[];
}
