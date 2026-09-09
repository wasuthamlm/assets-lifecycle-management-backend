import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Department } from './entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Asset } from '../assets/entities/asset.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { HolderType } from '@common/enums';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department) private repo: Repository<Department>,
    private dataSource: DataSource,
  ) {}

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
    if (dept.children?.length) {
      throw new BadRequestException('ไม่สามารถลบแผนกนี้ได้ เนื่องจากยังมีแผนกย่อยอยู่ภายใต้แผนกนี้');
    }
    const [employeeCount, assetHolderCount] = await Promise.all([
      this.dataSource.getRepository(Employee).count({ where: { departmentId: id } }),
      // currentHolderId เป็น polymorphic ไม่มี FK constraint จริง ต้องเช็คเอง ไม่งั้น asset จะค้างอ้างแผนกที่ไม่มีอยู่
      this.dataSource.getRepository(Asset).count({ where: { currentHolderType: HolderType.DEPARTMENT, currentHolderId: id } }),
    ]);
    if (employeeCount > 0) {
      throw new BadRequestException('ไม่สามารถลบแผนกนี้ได้ เนื่องจากยังมีพนักงานสังกัดแผนกนี้อยู่');
    }
    if (assetHolderCount > 0) {
      throw new BadRequestException('ไม่สามารถลบแผนกนี้ได้ เนื่องจากยังมีทรัพย์สินถือครองอยู่โดยแผนกนี้');
    }
    await this.repo.remove(dept);
    return { success: true };
  }
}
