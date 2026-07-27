import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AllowedDomain } from './entities/allowed-domain.entity';
import { CreateAllowedDomainDto } from './dto/create-allowed-domain.dto';
import { UpdateAllowedDomainDto } from './dto/update-allowed-domain.dto';

@Injectable()
export class AllowedDomainsService {
  constructor(@InjectRepository(AllowedDomain) private repo: Repository<AllowedDomain>) {}

  create(dto: CreateAllowedDomainDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findAll() {
    return this.repo.find({ relations: ['company'], order: { createdAt: 'DESC' } });
  }

  async findOne(id: number) {
    const domain = await this.repo.findOne({ where: { allowedDomainId: id }, relations: ['company'] });
    if (!domain) throw new NotFoundException(`ไม่พบโดเมน id ${id}`);
    return domain;
  }

  async update(id: number, dto: UpdateAllowedDomainDto) {
    const domain = await this.findOne(id);
    Object.assign(domain, dto);
    return this.repo.save(domain);
  }

  async remove(id: number) {
    const domain = await this.findOne(id);
    await this.repo.remove(domain);
    return { success: true };
  }

  /** ใช้ตอน login ผ่าน Microsoft SSO เช็คว่าโดเมนของอีเมลนี้ได้รับอนุญาตหรือไม่ */
  async isDomainAllowed(email: string): Promise<boolean> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;
    const match = await this.repo.findOne({ where: { domain, isEnabled: true } });
    return !!match;
  }
}
