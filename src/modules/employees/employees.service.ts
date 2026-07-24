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
}
