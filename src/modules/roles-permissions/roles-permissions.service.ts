import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { EmployeeRole } from './entities/employee-role.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { AssignPermissionsDto } from './dto/assign-permission.dto';
import { AssignRolesDto } from './dto/assign-role.dto';

@Injectable()
export class RolesPermissionsService {
  constructor(
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    @InjectRepository(Permission) private permissionRepo: Repository<Permission>,
    @InjectRepository(RolePermission) private rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(EmployeeRole) private employeeRoleRepo: Repository<EmployeeRole>,
  ) {}

  // ---- Roles ----
  createRole(dto: CreateRoleDto) {
    return this.roleRepo.save(this.roleRepo.create(dto));
  }

  findAllRoles() {
    return this.roleRepo.find({ relations: ['rolePermissions', 'rolePermissions.permission'] });
  }

  async findRole(id: number) {
    const role = await this.roleRepo.findOne({
      where: { roleId: id },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });
    if (!role) throw new NotFoundException(`ไม่พบ role id ${id}`);
    return role;
  }

  // ---- Permissions ----
  createPermission(dto: CreatePermissionDto) {
    return this.permissionRepo.save(this.permissionRepo.create(dto));
  }

  findAllPermissions() {
    return this.permissionRepo.find();
  }

  // ---- Assign permissions ให้ role (replace ทั้งชุด) ----
  async assignPermissionsToRole(roleId: number, dto: AssignPermissionsDto) {
    await this.findRole(roleId);
    await this.rolePermissionRepo.delete({ roleId });
    const rows = dto.permissionIds.map((permissionId) =>
      this.rolePermissionRepo.create({ roleId, permissionId }),
    );
    await this.rolePermissionRepo.save(rows);
    return this.findRole(roleId);
  }

  // ---- Assign roles ให้ employee (replace ทั้งชุด, รองรับหลาย role ต่อคน) ----
  async assignRolesToEmployee(employeeId: number, dto: AssignRolesDto) {
    await this.employeeRoleRepo.delete({ employeeId });
    const rows = dto.roleIds.map((roleId) =>
      this.employeeRoleRepo.create({ employeeId, roleId, assignedDate: new Date() }),
    );
    return this.employeeRoleRepo.save(rows);
  }
}
