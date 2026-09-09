import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Location } from './entities/location.entity';
import { Asset } from '../assets/entities/asset.entity';
import { StockLevel } from '../stock/entities/stock-level.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { HolderType } from '@common/enums';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location) private repo: Repository<Location>,
    private dataSource: DataSource,
  ) {}

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
    // ไม่มี onDelete บน FK เหล่านี้ — ปล่อยให้ลบตรงๆ จะโดน Postgres FK error ดิบๆ (currentLocationId/stock_levels)
    // หรือแย่กว่านั้นคือ currentHolderId เป็น polymorphic ไม่มี FK constraint จริงเลย ลบไปแล้ว asset จะค้าง
    // อ้าง location ที่ไม่มีอยู่แบบเงียบๆ จึงต้องเช็คเองทั้งสองแบบก่อนลบ
    if (l.children?.length) {
      throw new BadRequestException('ไม่สามารถลบสถานที่นี้ได้ เนื่องจากยังมีสถานที่ย่อยอยู่ภายใต้สถานที่นี้');
    }
    const assetRepo = this.dataSource.getRepository(Asset);
    const [byCurrentLocation, byHolder, stockCount] = await Promise.all([
      assetRepo.count({ where: { currentLocationId: id } }),
      assetRepo.count({ where: { currentHolderType: HolderType.LOCATION, currentHolderId: id } }),
      this.dataSource.getRepository(StockLevel).count({ where: { locationId: id } }),
    ]);
    if (byCurrentLocation > 0 || byHolder > 0) {
      throw new BadRequestException('ไม่สามารถลบสถานที่นี้ได้ เนื่องจากยังมีทรัพย์สินอยู่ที่สถานที่นี้');
    }
    if (stockCount > 0) {
      throw new BadRequestException('ไม่สามารถลบสถานที่นี้ได้ เนื่องจากยังมีสต๊อกสินค้าผูกอยู่กับสถานที่นี้');
    }
    await this.repo.remove(l);
    return { success: true };
  }
}
