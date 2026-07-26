import 'reflect-metadata';
import * as argon2 from 'argon2';
import dataSource from '../../config/typeorm.config';
import { Company } from '../../modules/companies/entities/company.entity';
import { Role } from '../../modules/roles-permissions/entities/role.entity';
import { Permission } from '../../modules/roles-permissions/entities/permission.entity';
import { RolePermission } from '../../modules/roles-permissions/entities/role-permission.entity';
import { Department } from '../../modules/departments/entities/department.entity';
import { Employee } from '../../modules/employees/entities/employee.entity';
import { EmployeeRole } from '../../modules/roles-permissions/entities/employee-role.entity';
import { User } from '../../modules/users/entities/user.entity';

/**
 * Seed ข้อมูลเริ่มต้นที่จำเป็นต่อการใช้งานระบบ:
 * - permission_code มาตรฐานทุก module
 * - role: it_admin (ครบทุกสิทธิ์) และ employee (สิทธิ์พื้นฐานสำหรับพนักงานทั่วไป)
 * - บริษัท + แผนก + พนักงาน + user login เริ่มต้น 1 คน (admin)
 *
 * รันด้วย: npm run seed
 * ปลอดภัยที่จะรันซ้ำได้ (idempotent) — เช็คก่อน insert ทุกจุด
 */
const PERMISSIONS = [
  'master.manage',
  'rbac.manage',
  'user.create', 'user.view_all', 'user.update', 'user.delete',
  'employee.create', 'employee.view_all', 'employee.update', 'employee.delete',
  'asset.create', 'asset.view', 'asset.update', 'asset.delete',
  'stock.manage', 'stock.view',
  'po.create', 'po.view', 'po.approve',
  'goods_receipt.create', 'goods_receipt.view',
  'requisition.create', 'requisition.view_own', 'requisition.view_all', 'requisition.approve',
  'assignment.issue', 'assignment.return',
  'repair.create', 'repair.view', 'repair.update',
  'warranty.manage',
  'disposal.create', 'disposal.view',
  'attachment.manage', 'attachment.view',
  'dashboard.view',
];

async function run() {
  await dataSource.initialize();
  console.log('🔌 Connected to database');

  const companyRepo = dataSource.getRepository(Company);
  const roleRepo = dataSource.getRepository(Role);
  const permissionRepo = dataSource.getRepository(Permission);
  const rolePermissionRepo = dataSource.getRepository(RolePermission);
  const departmentRepo = dataSource.getRepository(Department);
  const employeeRepo = dataSource.getRepository(Employee);
  const employeeRoleRepo = dataSource.getRepository(EmployeeRole);
  const userRepo = dataSource.getRepository(User);

  // 1) Permissions
  const permissionEntities: Permission[] = [];
  for (const code of PERMISSIONS) {
    let p = await permissionRepo.findOne({ where: { permissionCode: code } });
    if (!p) {
      p = await permissionRepo.save(permissionRepo.create({ permissionCode: code }));
      console.log(`  + permission: ${code}`);
    }
    permissionEntities.push(p);
  }

  // 2) Roles
  let adminRole = await roleRepo.findOne({ where: { roleName: 'it_admin' } });
  if (!adminRole) {
    adminRole = await roleRepo.save(roleRepo.create({ roleName: 'it_admin', description: 'ผู้ดูแลระบบ IT — สิทธิ์เต็ม' }));
    console.log('  + role: it_admin');
  }

  let employeeRole = await roleRepo.findOne({ where: { roleName: 'employee' } });
  if (!employeeRole) {
    employeeRole = await roleRepo.save(
      roleRepo.create({ roleName: 'employee', description: 'พนักงานทั่วไป — ขอเบิก/ยืมของได้เท่านั้น' }),
    );
    console.log('  + role: employee');
  }

  // 3) Role-Permission mapping (idempotent: ลบของเดิมแล้วใส่ใหม่)
  await rolePermissionRepo.delete({ roleId: adminRole.roleId });
  await rolePermissionRepo.save(
    permissionEntities.map((p) => rolePermissionRepo.create({ roleId: adminRole!.roleId, permissionId: p.permissionId })),
  );

  const employeeBasicCodes = ['requisition.create', 'requisition.view_own', 'asset.view'];
  const employeePermissions = permissionEntities.filter((p) => employeeBasicCodes.includes(p.permissionCode));
  await rolePermissionRepo.delete({ roleId: employeeRole.roleId });
  await rolePermissionRepo.save(
    employeePermissions.map((p) => rolePermissionRepo.create({ roleId: employeeRole!.roleId, permissionId: p.permissionId })),
  );
  console.log('  ✓ mapped role_permissions');

  // 4) Company + Department + Employee + User (admin) เริ่มต้น
  let company = await companyRepo.findOne({ where: { companyCode: 'MLM' } });
  if (!company) {
    company = await companyRepo.save(companyRepo.create({ companyCode: 'MLM', companyName: 'Millimed Co., Ltd.' }));
    console.log('  + company: MLM');
  }

  let itDept = await departmentRepo.findOne({ where: { departmentName: 'IT', companyId: company.companyId } });
  if (!itDept) {
    itDept = await departmentRepo.save(
      departmentRepo.create({ departmentName: 'IT', companyId: company.companyId, site: 'office' }),
    );
    console.log('  + department: IT');
  }

  let adminEmployee = await employeeRepo.findOne({ where: { employeeCode: 'EMP-0001' } });
  if (!adminEmployee) {
    adminEmployee = await employeeRepo.save(
      employeeRepo.create({
        employeeCode: 'EMP-0001',
        fullName: 'System Administrator',
        departmentId: itDept.departmentId,
        position: 'IT Admin',
        email: 'admin@millimed.local',
      }),
    );
    console.log('  + employee: EMP-0001 (System Administrator)');
  }

  const existingLink = await employeeRoleRepo.findOne({
    where: { employeeId: adminEmployee.employeeId, roleId: adminRole.roleId },
  });
  if (!existingLink) {
    await employeeRoleRepo.save(
      employeeRoleRepo.create({ employeeId: adminEmployee.employeeId, roleId: adminRole.roleId, assignedDate: new Date() }),
    );
    console.log('  ✓ assigned role it_admin -> EMP-0001');
  }

  let adminUser = await userRepo.findOne({ where: { username: 'admin' } });
  if (!adminUser) {
    adminUser = await userRepo.save(
      userRepo.create({
        username: 'admin',
        email: 'admin@millimed.local',
        passwordHash: await argon2.hash('Admin@12345'),
        employeeId: adminEmployee.employeeId,
        isActive: true,
      }),
    );
    console.log('  + user login: admin / Admin@12345  (⚠️ เปลี่ยนรหัสผ่านทันทีหลังใช้งานจริง)');
  }

  await dataSource.destroy();
  console.log('✅ Seed completed');
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
