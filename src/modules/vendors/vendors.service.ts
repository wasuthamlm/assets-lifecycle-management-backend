import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Vendor } from './entities/vendor.entity';
import { Asset } from '../assets/entities/asset.entity';
import { PurchaseOrder } from '../purchasing/entities/purchase-order.entity';
import { Repair } from '../repairs/entities/repair.entity';
import { Warranty } from '../warranty/entities/warranty.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { HolderType } from '@common/enums';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor) private repo: Repository<Vendor>,
    private dataSource: DataSource,
  ) {}

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
    const assetRepo = this.dataSource.getRepository(Asset);
    const [byVendor, byHolder, poCount, repairCount, warrantyCount] = await Promise.all([
      assetRepo.count({ where: { vendorId: id } }),
      // currentHolderId เป็น polymorphic ไม่มี FK constraint จริง ต้องเช็คเอง ไม่งั้น asset จะค้างอ้าง vendor ที่ไม่มีอยู่
      assetRepo.count({ where: { currentHolderType: HolderType.VENDOR, currentHolderId: id } }),
      this.dataSource.getRepository(PurchaseOrder).count({ where: { vendorId: id } }),
      this.dataSource.getRepository(Repair).count({ where: { vendorId: id } }),
      this.dataSource.getRepository(Warranty).count({ where: { vendorId: id } }),
    ]);
    if (byVendor > 0 || byHolder > 0 || poCount > 0 || repairCount > 0 || warrantyCount > 0) {
      throw new BadRequestException(
        'ไม่สามารถลบผู้ขายรายนี้ได้ เนื่องจากยังมีข้อมูลอ้างอิงถึงผู้ขายรายนี้อยู่ (ทรัพย์สิน/ใบสั่งซื้อ/ใบซ่อม/ประกัน)',
      );
    }
    await this.repo.remove(v);
    return { success: true };
  }
}
