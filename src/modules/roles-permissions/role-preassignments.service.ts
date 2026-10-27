import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { RolePreassignment } from './entities/role-preassignment.entity';
import { Role } from './entities/role.entity';
import { EmployeeRole } from './entities/employee-role.entity';
import { Employee } from '../employees/entities/employee.entity';
import { User } from '../users/entities/user.entity';
import { UpsertRolePreassignmentDto } from './dto/upsert-role-preassignment.dto';
import { AllowedDomainsService } from '../allowed-domains/allowed-domains.service';

/**
 * กำหนด role ล่วงหน้าให้อีเมลบริษัท — แทน flow "pre-register" เดิมที่สร้างบัญชี + รหัสผ่านชั่วคราวให้
 * ซึ่งสับสนกับการ login ผ่าน Microsoft SSO ตรงนี้ไม่สร้างทั้ง user และ employee แค่จำไว้ว่าอีเมลนี้ควรได้ role อะไร
 */
@Injectable()
export class RolePreassignmentsService {
  constructor(
    @InjectRepository(RolePreassignment) private repo: Repository<RolePreassignment>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private allowedDomainsService: AllowedDomainsService,
    private dataSource: DataSource,
  ) {}

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async upsert(dto: UpsertRolePreassignmentDto, createdByUserId: number) {
    const email = dto.email.trim().toLowerCase();

    if (!(await this.allowedDomainsService.isDomainAllowed(email))) {
      throw new BadRequestException(
        `โดเมน ${email.split('@')[1]} ยังไม่ได้รับอนุญาตให้ login ผ่าน Microsoft SSO — เพิ่มโดเมนในหน้าตั้งค่าก่อน`,
      );
    }

    // มีข้อมูลพนักงานอีเมลนี้อยู่แล้ว (หรือมีบัญชีที่ผูกพนักงานแล้ว) — role ผูกกับ employee อยู่แล้ว ให้ไปกำหนดสิทธิ์ตรงนั้นแทน
    // ไม่งั้นจะมี 2 ที่ให้แก้ role ของคนเดียวกันแล้วค่าขัดกัน
    const existingEmployee = await this.employeeRepo
      .createQueryBuilder('e')
      .where('lower(e.email) = :email', { email })
      .getOne();
    const linkedUser = await this.usersRepo
      .createQueryBuilder('u')
      .where('lower(u.email) = :email', { email })
      .andWhere('u.employeeId IS NOT NULL')
      .getOne();
    if (existingEmployee || linkedUser) {
      throw new ConflictException('อีเมลนี้มีข้อมูลพนักงานในระบบอยู่แล้ว — ใช้ปุ่ม "กำหนดสิทธิ์" ที่แถวพนักงานคนนั้นแทน');
    }

    const roleIds = Array.from(new Set(dto.roleIds));
    const found = await this.roleRepo.find({ where: { roleId: In(roleIds) } });
    if (found.length !== roleIds.length) {
      const foundIds = new Set(found.map((r) => r.roleId));
      const missing = roleIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(`ไม่พบ role id: ${missing.join(', ')}`);
    }

    const existing = await this.repo.findOne({ where: { email } });
    if (existing) {
      existing.roleIds = roleIds;
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ email, roleIds, createdByUserId }));
  }

  async remove(id: number) {
    const row = await this.repo.findOne({ where: { rolePreassignmentId: id } });
    if (!row) throw new NotFoundException(`ไม่พบรายการกำหนดสิทธิ์ล่วงหน้า id ${id}`);
    await this.repo.remove(row);
    return { success: true };
  }

  /**
   * เรียกตอน user ถูกผูกกับ employee ครั้งแรก (AuthService) — ถ้าอีเมลนี้มี role กำหนดล่วงหน้าไว้ ใส่ role ให้
   * employee แล้วลบแถวทิ้ง คืน roleIds ที่ใส่ไปจริง (ว่าง = ไม่มีอะไรกำหนดไว้)
   * role ที่ถูกลบออกจากระบบไปแล้วระหว่างรอ login จะถูกข้ามไปเงียบๆ
   */
  async consumeForEmployee(email: string | null | undefined, employeeId: number): Promise<number[]> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) return [];

    const row = await this.repo.findOne({ where: { email: normalized } });
    if (!row) return [];

    const roles = row.roleIds.length ? await this.roleRepo.find({ where: { roleId: In(row.roleIds) } }) : [];
    const roleIds = roles.map((r) => r.roleId);

    await this.dataSource.transaction(async (manager) => {
      if (roleIds.length) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(EmployeeRole)
          .values(roleIds.map((roleId) => ({ employeeId, roleId, assignedDate: new Date() })))
          .orIgnore()
          .execute();
      }
      await manager.delete(RolePreassignment, { rolePreassignmentId: row.rolePreassignmentId });
    });

    return roleIds;
  }
}
