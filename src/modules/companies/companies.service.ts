import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(@InjectRepository(Company) private repo: Repository<Company>) {}

  create(dto: CreateCompanyDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findAll() {
    return this.repo.find();
  }

  async findOne(id: number) {
    const company = await this.repo.findOne({ where: { companyId: id } });
    if (!company) throw new NotFoundException(`ไม่พบบริษัท id ${id}`);
    return company;
  }

  async update(id: number, dto: UpdateCompanyDto) {
    const company = await this.findOne(id);
    Object.assign(company, dto);
    return this.repo.save(company);
  }

  async remove(id: number) {
    const company = await this.findOne(id);
    await this.repo.remove(company);
    return { success: true };
  }
}
