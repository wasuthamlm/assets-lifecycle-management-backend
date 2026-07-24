import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(@InjectRepository(Department) private repo: Repository<Department>) {}

  create(dto: CreateDepartmentDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findAll() {
    return this.repo.find({ relations: ['company', 'parent'] });
  }

  async findOne(id: number) {
    const dept = await this.repo.findOne({ where: { departmentId: id }, relations: ['company', 'parent', 'children'] });
    if (!dept) throw new NotFoundException(`ไม่พบแผนก id ${id}`);
    return dept;
  }

  async update(id: number, dto: UpdateDepartmentDto) {
    const dept = await this.findOne(id);
    Object.assign(dept, dto);
    return this.repo.save(dept);
  }

  async remove(id: number) {
    const dept = await this.findOne(id);
    await this.repo.remove(dept);
    return { success: true };
  }
}
