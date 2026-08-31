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
import { AllowedDomain } from '../../modules/allowed-domains/entities/allowed-domain.entity';

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
  const allowedDomainRepo = dataSource.getRepository(AllowedDomain);

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

  let hrRole = await roleRepo.findOne({ where: { roleName: 'hr' } });
  if (!hrRole) {
    hrRole = await roleRepo.save(
      roleRepo.create({ roleName: 'hr', description: 'ฝ่ายบุคคล — ดูพนักงาน ทรัพย์สินที่ถืออยู่ และใบขอเบิก/ยืมทั้งหมด (ไม่แก้ไข/อนุมัติ)' }),
    );
    console.log('  + role: hr');
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

  // hr เห็นได้เฉพาะหน้าที่เกี่ยวกับข้อมูลพนักงาน/ทรัพย์สินที่เกี่ยวข้อง — ไม่แตะ PO/สต๊อก/ซ่อมบำรุง/จำหน่ายทิ้ง/RBAC
  // มี requisition.create เพื่อเบิก/ยืมแทนพนักงานใหม่ได้ (ผ่าน onBehalfOfEmployeeId — ดู CreateRequisitionDto)
  // และต้องมี requisition.view_all คู่กันเสมอ เพราะเป็น permission ที่ gate สิทธิ์เบิกแทนคนอื่นด้วย
  const hrCodes = ['dashboard.view', 'employee.view_all', 'asset.view', 'requisition.view_all', 'requisition.create'];
  const hrPermissions = permissionEntities.filter((p) => hrCodes.includes(p.permissionCode));
  await rolePermissionRepo.delete({ roleId: hrRole.roleId });
  await rolePermissionRepo.save(
    hrPermissions.map((p) => rolePermissionRepo.create({ roleId: hrRole!.roleId, permissionId: p.permissionId })),
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
        mustChangePassword: true,
      }),
    );
    console.log('  + user login: admin / Admin@12345  (ต้องเปลี่ยนรหัสผ่านทันทีตอน login ครั้งแรก)');
  }

  // 5) พนักงานทดสอบ role "employee" — ไว้เทสการมองเห็นหน้า UI ของผู้ใช้งานทั่วไป
  let testEmployee = await employeeRepo.findOne({ where: { employeeCode: 'EMP-0002' } });
  if (!testEmployee) {
    testEmployee = await employeeRepo.save(
      employeeRepo.create({
        employeeCode: 'EMP-0002',
        fullName: 'Test Employee',
        departmentId: itDept.departmentId,
        position: 'Staff',
        email: 'test.employee@millimed.local',
      }),
    );
    console.log('  + employee: EMP-0002 (Test Employee)');
  }

  const existingTestLink = await employeeRoleRepo.findOne({
    where: { employeeId: testEmployee.employeeId, roleId: employeeRole.roleId },
  });
  if (!existingTestLink) {
    await employeeRoleRepo.save(
      employeeRoleRepo.create({ employeeId: testEmployee.employeeId, roleId: employeeRole.roleId, assignedDate: new Date() }),
    );
    console.log('  ✓ assigned role employee -> EMP-0002');
  }

  let testUser = await userRepo.findOne({ where: { username: 'test.employee' } });
  if (!testUser) {
    testUser = await userRepo.save(
      userRepo.create({
        username: 'test.employee',
        email: 'test.employee@millimed.local',
        passwordHash: await argon2.hash('Test@12345'),
        employeeId: testEmployee.employeeId,
        isActive: true,
        mustChangePassword: true,
      }),
    );
    console.log('  + user login: test.employee / Test@12345  (role: employee — สำหรับเทส UI, ต้องเปลี่ยนรหัสผ่านตอน login ครั้งแรก)');
  }

  // 6) พนักงานทดสอบ role "hr" — ไว้เทสสิทธิ์มุมมองฝ่ายบุคคล (ดูพนักงาน/ทรัพย์สิน/ใบขอเบิกทั้งหมด แบบอ่านอย่างเดียว)
  let testHrEmployee = await employeeRepo.findOne({ where: { employeeCode: 'EMP-0003' } });
  if (!testHrEmployee) {
    testHrEmployee = await employeeRepo.save(
      employeeRepo.create({
        employeeCode: 'EMP-0003',
        fullName: 'Test HR',
        departmentId: itDept.departmentId,
        position: 'HR Staff',
        email: 'test.hr@millimed.local',
      }),
    );
    console.log('  + employee: EMP-0003 (Test HR)');
  }

  const existingHrLink = await employeeRoleRepo.findOne({
    where: { employeeId: testHrEmployee.employeeId, roleId: hrRole.roleId },
  });
  if (!existingHrLink) {
    await employeeRoleRepo.save(
      employeeRoleRepo.create({ employeeId: testHrEmployee.employeeId, roleId: hrRole.roleId, assignedDate: new Date() }),
    );
    console.log('  ✓ assigned role hr -> EMP-0003');
  }

  let testHrUser = await userRepo.findOne({ where: { username: 'test.hr' } });
  if (!testHrUser) {
    testHrUser = await userRepo.save(
      userRepo.create({
        username: 'test.hr',
        email: 'test.hr@millimed.local',
        passwordHash: await argon2.hash('Hr@12345678'),
        employeeId: testHrEmployee.employeeId,
        isActive: true,
        mustChangePassword: true,
      }),
    );
    console.log('  + user login: test.hr / Hr@12345678  (role: hr — สำหรับเทส UI, ต้องเปลี่ยนรหัสผ่านตอน login ครั้งแรก)');
  }

  // 7) โดเมนที่อนุญาตให้ login ผ่าน Microsoft SSO (ยังไม่ได้ต่อ SSO จริง แต่เตรียมรายการไว้ก่อน)
  let allowedDomain = await allowedDomainRepo.findOne({ where: { domain: 'millimedthailand.com' } });
  if (!allowedDomain) {
    allowedDomain = await allowedDomainRepo.save(
      allowedDomainRepo.create({ domain: 'millimedthailand.com', companyId: company.companyId, isEnabled: true }),
    );
    console.log('  + allowed domain: millimedthailand.com (company: MLM)');
  }

  await dataSource.destroy();
  console.log('✅ Seed completed');
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
