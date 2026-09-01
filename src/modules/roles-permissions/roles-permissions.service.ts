import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { EmployeeRole } from './entities/employee-role.entity';
import { Employee } from '../employees/entities/employee.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { AssignPermissionsDto } from './dto/assign-permission.dto';
import { AssignRolesDto } from './dto/assign-role.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@common/enums';

@Injectable()
export class RolesPermissionsService {
  constructor(
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    @InjectRepository(Permission) private permissionRepo: Repository<Permission>,
    @InjectRepository(RolePermission) private rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(EmployeeRole) private employeeRoleRepo: Repository<EmployeeRole>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    private dataSource: DataSource,
    private notificationsService: NotificationsService,
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

  /**
   * กันล็อกตัวเอง — ถ้าบันทึกแล้วไม่มีพนักงานคนไหนถือ rbac.manage เหลืออยู่เลยสักคน (ไม่ว่าจะผ่าน role
   * ไหนก็ตาม) จะไม่มีใครเข้าหน้า "สิทธิ์การใช้งาน" เพื่อแก้คืนได้อีก ต้องรัน seed/แก้ DB ตรงๆ เท่านั้น
   * เช็คหลัง insert ภายใน transaction เดียวกัน — ถ้า throw ที่นี่ การเปลี่ยนแปลงทั้งหมดจะ rollback
   */
  private async assertRbacAdminRemains(manager: EntityManager) {
    const row = await manager
      .createQueryBuilder(EmployeeRole, 'er')
      .innerJoin(RolePermission, 'rp', 'rp.roleId = er.roleId')
      .innerJoin(Permission, 'p', 'p.permissionId = rp.permissionId')
      .where('p.permissionCode = :code', { code: 'rbac.manage' })
      .select('COUNT(DISTINCT er.employeeId)', 'cnt')
      .getRawOne<{ cnt: string }>();
    if (Number(row?.cnt ?? 0) === 0) {
      throw new ConflictException(
        'ไม่สามารถบันทึกได้ — การเปลี่ยนแปลงนี้จะทำให้ไม่มีพนักงานคนใดถือสิทธิ์ rbac.manage เหลืออยู่เลย (จะไม่มีใครเข้ามาจัดการสิทธิ์ต่อได้อีก)',
      );
    }
  }

  // ---- Assign permissions ให้ role (replace ทั้งชุด) ----
  async assignPermissionsToRole(roleId: number, dto: AssignPermissionsDto) {
    await this.findRole(roleId);

    if (dto.permissionIds.length > 0) {
      const found = await this.permissionRepo.find({ where: { permissionId: In(dto.permissionIds) } });
      if (found.length !== new Set(dto.permissionIds).size) {
        const foundIds = new Set(found.map((p) => p.permissionId));
        const missing = dto.permissionIds.filter((id) => !foundIds.has(id));
        throw new NotFoundException(`ไม่พบ permission id: ${missing.join(', ')}`);
      }
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId });
      const rows = dto.permissionIds.map((permissionId) => manager.create(RolePermission, { roleId, permissionId }));
      await manager.save(rows);
      await this.assertRbacAdminRemains(manager);
      return manager.findOne(Role, {
        where: { roleId },
        relations: ['rolePermissions', 'rolePermissions.permission'],
      });
    });
  }

  // ---- Assign roles ให้ employee (replace ทั้งชุด, รองรับหลาย role ต่อคน) ----
  async assignRolesToEmployee(employeeId: number, dto: AssignRolesDto) {
    const employee = await this.employeeRepo.findOne({ where: { employeeId } });
    if (!employee) throw new NotFoundException(`ไม่พบพนักงาน id ${employeeId}`);

    if (dto.roleIds.length > 0) {
      const found = await this.roleRepo.find({ where: { roleId: In(dto.roleIds) } });
      if (found.length !== new Set(dto.roleIds).size) {
        const foundIds = new Set(found.map((r) => r.roleId));
        const missing = dto.roleIds.filter((id) => !foundIds.has(id));
        throw new NotFoundException(`ไม่พบ role id: ${missing.join(', ')}`);
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      await manager.delete(EmployeeRole, { employeeId });
      const rows = dto.roleIds.map((roleId) => manager.create(EmployeeRole, { employeeId, roleId, assignedDate: new Date() }));
      const saved = await manager.save(rows);
      await this.assertRbacAdminRemains(manager);
      return saved;
    });

    // แจ้งเจ้าตัวทันทีที่ role เปลี่ยน — ฝั่ง frontend ใช้ตรงนี้ auto-refresh /auth/me เอง
    // (ดู useNotificationsStream) กันไม่ให้ user ที่รอ permission อยู่ต้องกด refresh เอง
    await this.notificationsService.notify(
      employeeId,
      NotificationType.PERMISSIONS_UPDATED,
      'สิทธิ์การใช้งานของคุณได้รับการอัปเดต',
      `${employee.fullName} ได้รับการกำหนดบทบาท/สิทธิ์การใช้งานใหม่แล้ว`,
      'employee',
      employeeId,
    );

    return result;
  }
}
