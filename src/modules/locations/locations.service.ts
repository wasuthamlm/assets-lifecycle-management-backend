import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './entities/location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(@InjectRepository(Location) private repo: Repository<Location>) {}

  create(dto: CreateLocationDto) { return this.repo.save(this.repo.create(dto)); }
  findAll() { return this.repo.find({ relations: ['company', 'parent'] }); }
  async findOne(id: number) {
    const l = await this.repo.findOne({ where: { locationId: id }, relations: ['company', 'parent', 'children'] });
    if (!l) throw new NotFoundException(`ไม่พบสถานที่ id ${id}`);
    return l;
  }
  async update(id: number, dto: UpdateLocationDto) {
    const l = await this.findOne(id);
    Object.assign(l, dto);
    return this.repo.save(l);
  }
  async remove(id: number) {
    const l = await this.findOne(id);
    await this.repo.remove(l);
    return { success: true };
  }
}
