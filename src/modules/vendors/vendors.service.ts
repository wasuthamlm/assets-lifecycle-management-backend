import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vendor } from './entities/vendor.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(@InjectRepository(Vendor) private repo: Repository<Vendor>) {}

  create(dto: CreateVendorDto) {
    return this.repo.save(this.repo.create(dto));
  }
  findAll() {
    return this.repo.find();
  }
  async findOne(id: number) {
    const v = await this.repo.findOne({ where: { vendorId: id } });
    if (!v) throw new NotFoundException(`ไม่พบ vendor id ${id}`);
    return v;
  }
  async update(id: number, dto: UpdateVendorDto) {
    const v = await this.findOne(id);
    Object.assign(v, dto);
    return this.repo.save(v);
  }
  async remove(id: number) {
    const v = await this.findOne(id);
    await this.repo.remove(v);
    return { success: true };
  }
}
