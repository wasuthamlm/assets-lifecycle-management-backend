import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PreRegisterEmployeeDto } from './dto/pre-register-employee.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../roles-permissions/entities/role.entity';
import { EmployeeRole } from '../roles-permissions/entities/employee-role.entity';
import { MailService } from '../mail/mail.service';
import { generateTempPassword } from '@common/utils/generate-password.util';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private repo: Repository<Employee>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    private dataSource: DataSource,
    private mailService: MailService,
  ) {}

  create(dto: CreateEmployeeDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findAll() {
    return this.repo.find({ relations: ['department'] });
  }

  // เฉพาะพนักงานที่มีสิทธิ์ requisition.approve จริง (เช่น HR, IT Admin) ให้เลือกเป็นผู้อนุมัติได้ในฟอร์ม —
  // ไม่งั้น dropdown จะมี "พนักงานทั่วไป" ปนมาด้วยทั้งที่กดอนุมัติจริงไม่ได้ (โดน 403 ตอนอนุมัติ)
  findDirectory() {
    return this.repo
      .createQueryBuilder('e')
      .innerJoin('e.employeeRoles', 'er')
      .innerJoin('er.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .innerJoin('rp.permission', 'p')
      .where('p.permissionCode = :code', { code: 'requisition.approve' })
      .select(['e.employeeId', 'e.fullName', 'e.departmentId', 'e.position'])
      .distinct(true)
      .orderBy('e.fullName', 'ASC')
      .getMany();
  }

  async findOne(id: number) {
    const emp = await this.repo.findOne({
      where: { employeeId: id },
      relations: ['department', 'employeeRoles', 'employeeRoles.role'],
    });
    if (!emp) throw new NotFoundException(`ไม่พบพนักงาน id ${id}`);
    return emp;
  }

  async update(id: number, dto: UpdateEmployeeDto) {
    const emp = await this.findOne(id);
    Object.assign(emp, dto);
    return this.repo.save(emp);
  }

  async remove(id: number) {
    const emp = await this.findOne(id);
    await this.repo.remove(emp);
    return { success: true };
  }

  /**
   * ลงทะเบียนพนักงานใหม่ล่วงหน้าแบบครบวงจร: สร้าง employee + user login (username = email) +
   * กำหนด role เริ่มต้น ในทรานแซกชันเดียว แล้ว gen รหัสผ่านชั่วคราวส่งอีเมลให้ (ผู้ใช้ต้องเปลี่ยนตอน login ครั้งแรก)
   */
  async preRegister(dto: PreRegisterEmployeeDto) {
    const existingCode = await this.repo.findOne({ where: { employeeCode: dto.employeeCode } });
    if (existingCode) throw new ConflictException('รหัสพนักงานนี้ถูกใช้ไปแล้ว');

    const existingEmail = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existingEmail) throw new ConflictException('อีเมลนี้ถูกใช้ไปแล้ว');

    const existingUsername = await this.usersRepo.findOne({ where: { username: dto.email } });
    if (existingUsername) throw new ConflictException('อีเมลนี้ถูกใช้เป็น username ไปแล้ว');

    const roles = await this.roleRepo.find({ where: { roleId: In(dto.roleIds) } });
    if (roles.length !== new Set(dto.roleIds).size) {
      const foundIds = new Set(roles.map((r) => r.roleId));
      const missing = dto.roleIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(`ไม่พบ role id: ${missing.join(', ')}`);
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword);

    const { employee, user } = await this.dataSource.transaction(async (manager) => {
      const employee = await manager.save(
        manager.create(Employee, {
          employeeCode: dto.employeeCode,
          fullName: dto.fullName,
          departmentId: dto.departmentId,
          position: dto.position,
          email: dto.email,
        }),
      );

      const user = await manager.save(
        manager.create(User, {
          username: dto.email,
          email: dto.email,
          passwordHash,
          employeeId: employee.employeeId,
          isActive: true,
          mustChangePassword: true,
        }),
      );

      const employeeRoles = dto.roleIds.map((roleId) =>
        manager.create(EmployeeRole, { employeeId: employee.employeeId, roleId, assignedDate: new Date() }),
      );
      await manager.save(employeeRoles);

      return { employee, user };
    });

    await this.mailService.send(
      dto.email,
      'บัญชีผู้ใช้งานระบบทรัพย์สิน IT ของคุณ',
      `เรียนคุณ ${dto.fullName}\n\n` +
        `ระบบได้สร้างบัญชีผู้ใช้งานให้คุณแล้ว\n` +
        `Username: ${dto.email}\n` +
        `รหัสผ่านชั่วคราว: ${tempPassword}\n\n` +
        `กรุณาเข้าสู่ระบบและเปลี่ยนรหัสผ่านทันทีในการ login ครั้งแรก`,
    );

    const safeUser = { userId: user.userId, username: user.username, email: user.email };
    return { employee, user: safeUser, tempPassword };
  }
}
