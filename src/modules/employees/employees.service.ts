import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(@InjectRepository(Employee) private repo: Repository<Employee>) {}

  create(dto: CreateEmployeeDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findAll() {
    return this.repo.find({ relations: ['department'] });
  }

  // รายชื่อให้เลือกเป็นผู้อนุมัติในฟอร์มใบขอเบิก/ยืม — เฉพาะผู้ดูแลระบบ IT (role it_admin) เท่านั้น
  // ต้องตรงกับที่ RequisitionsService.create() เช็คว่าผู้อนุมัติทุกคนต้องเป็น it_admin
  findDirectory() {
    return this.repo
      .createQueryBuilder('e')
      .innerJoin('e.employeeRoles', 'er')
      .innerJoin('er.role', 'r')
      .where('r.roleName = :roleName', { roleName: 'it_admin' })
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
    // เก็บตัวพิมพ์เล็กเสมอ ให้ตรงกับอีเมลจาก Azure AD ตอนผูกบัญชีอัตโนมัติ (AuthService.findEmployeeByEmail)
    if (dto.email) emp.email = dto.email.trim().toLowerCase();
    return this.repo.save(emp);
  }

  async remove(id: number) {
    const emp = await this.findOne(id);
    await this.repo.remove(emp);
    return { success: true };
  }
}
