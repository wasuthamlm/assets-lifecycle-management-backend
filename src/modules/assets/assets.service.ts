import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Asset } from './entities/asset.entity';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { QueryAssetDto } from './dto/query-asset.dto';
import { AssetStatus, HolderType } from '@common/enums';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';
import { Location } from '../locations/entities/location.entity';
import { Vendor } from '../vendors/entities/vendor.entity';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private repo: Repository<Asset>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(Department) private departmentRepo: Repository<Department>,
    @InjectRepository(Location) private locationRepo: Repository<Location>,
    @InjectRepository(Vendor) private vendorRepo: Repository<Vendor>,
  ) {}

  async create(dto: CreateAssetDto) {
    await this.assertSerialNumberAvailable(dto.serialNumber);

    // ไม่ตั้งจะได้ current_status เป็น NULL ซึ่งไม่ตรงเงื่อนไข "in_stock" ใน query นับ availableCount เลย
    // (ดู findAll) ผลคือทรัพย์สินที่เพิ่งสร้างใหม่จะเบิก/ยืมไม่ได้ทันทีทั้งที่ยังไม่มีใครถือครอง
    // assetNo ไม่ให้ผู้ใช้กรอกเองแล้ว — generate เป็น UUID ฝั่ง server เสมอ (เดิมพิมพ์เองแล้วชนกันได้)
    return this.repo.save(
      this.repo.create({ ...dto, assetNo: randomUUID(), currentStatus: dto.currentStatus ?? AssetStatus.IN_STOCK }),
    );
  }

  /** serial number ควรระบุตัวเครื่องได้ไม่ซ้ำกัน — เช็คก่อน save เพื่อ error message ที่อ่านง่ายกว่า DB constraint ตรงๆ */
  private async assertSerialNumberAvailable(serialNumber: string | undefined, excludeAssetId?: number) {
    if (!serialNumber) return;
    const existing = await this.repo.findOne({ where: { serialNumber } });
    if (existing && existing.assetId !== excludeAssetId) {
      throw new ConflictException(`Serial number "${serialNumber}" ถูกใช้กับทรัพย์สินอื่นไปแล้ว (${existing.assetName})`);
    }
  }

  async findAll(query: QueryAssetDto) {
    const qb = this.repo
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.category', 'category')
      // ให้หน้ารายการโชว์ "หมวดหมู่หลัก" (ต้นสาย parent_category_id) ควบคู่กับหมวดหมู่ย่อยได้ — ไม่งั้นเห็นแค่
      // หมวดหมู่ย่อย (เช่น "Notebook") โดยไม่รู้ว่าอยู่ใต้หมวดหมู่หลักไหน (เช่น "คอมพิวเตอร์และอุปกรณ์ IT")
      .leftJoinAndSelect('category.parent', 'categoryParent')
      .leftJoinAndSelect('asset.currentLocation', 'location')
      .leftJoinAndSelect('asset.vendor', 'vendor');

    if (query.search) {
      // assetNo เป็น UUID ที่ backend generate เอง (ดู create()) ไม่มีใครพิมพ์ค้นหาด้วยได้จริง — ตัดออกจาก search
      qb.andWhere('(asset.assetName ILIKE :s OR asset.serialNumber ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }
    if (query.categoryId) qb.andWhere('asset.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.status) qb.andWhere('asset.currentStatus = :status', { status: query.status });
    if (query.holderType) qb.andWhere('asset.currentHolderType = :holderType', { holderType: query.holderType });

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.skip((page - 1) * limit).take(limit).orderBy('asset.assetId', 'DESC');

    const [data, total] = await qb.getManyAndCount();

    // นับจำนวนทรัพย์สิน "รุ่นเดียวกัน" (assetName ตรงกัน) ที่ยังว่าง (AVAILABLE) ให้แต่ละแถวในหน้านี้
    const names = [...new Set(data.map((a) => a.assetName))];
    const availableCounts = names.length
      ? await this.repo
          .createQueryBuilder('a')
          .select('a.assetName', 'assetName')
          .addSelect('COUNT(*)', 'count')
          .where('a.assetName IN (:...names)', { names })
          .andWhere('a.currentStatus = :status', { status: AssetStatus.IN_STOCK })
          .groupBy('a.assetName')
          .getRawMany<{ assetName: string; count: string }>()
      : [];
    const countByName = new Map(availableCounts.map((r) => [r.assetName, parseInt(r.count, 10)]));
    const withAvailableCount = data.map((a) => ({ ...a, availableCount: countByName.get(a.assetName) ?? 0 }));

    return { data: withAvailableCount, total, page, limit };
  }

  async findOne(id: number) {
    const asset = await this.repo.findOne({
      where: { assetId: id },
      relations: ['category', 'category.parent', 'currentLocation', 'vendor', 'createdByEmployee'],
    });
    if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${id}`);
    return asset;
  }

  /**
   * Resolve polymorphic holder (current_holder_type + current_holder_id) เป็น object จริง
   * TypeORM ไม่รองรับ relation แบบ polymorphic ตรงๆ จึงต้อง switch ตาม type แล้วยิง query เอง
   */
  async resolveHolder(asset: Asset): Promise<any | null> {
    if (!asset.currentHolderType || !asset.currentHolderId) return null;

    switch (asset.currentHolderType) {
      case HolderType.EMPLOYEE:
        return this.employeeRepo.findOne({ where: { employeeId: asset.currentHolderId } });
      case HolderType.DEPARTMENT:
        return this.departmentRepo.findOne({ where: { departmentId: asset.currentHolderId } });
      case HolderType.LOCATION:
        return this.locationRepo.findOne({ where: { locationId: asset.currentHolderId } });
      case HolderType.VENDOR:
        return this.vendorRepo.findOne({ where: { vendorId: asset.currentHolderId } });
      default:
        return null;
    }
  }

  async findOneWithHolder(id: number) {
    const asset = await this.findOne(id);
    const holder = await this.resolveHolder(asset);
    return { ...asset, holder };
  }

  async update(id: number, dto: UpdateAssetDto) {
    const asset = await this.findOne(id);
    if (dto.serialNumber && dto.serialNumber !== asset.serialNumber) {
      await this.assertSerialNumberAvailable(dto.serialNumber, id);
    }
    Object.assign(asset, dto);
    return this.repo.save(asset);
  }

  async remove(id: number) {
    const asset = await this.findOne(id);
    await this.repo.remove(asset);
    return { success: true };
  }
}
