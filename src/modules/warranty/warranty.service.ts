import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Warranty } from './entities/warranty.entity';
import { Asset } from '../assets/entities/asset.entity';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { RenewWarrantyDto } from './dto/renew-warranty.dto';
import { MovementType, WarrantyStatus } from '@common/enums';
import { MovementsService } from '../movements/movements.service';

@Injectable()
export class WarrantyService {
  constructor(
    @InjectRepository(Warranty) private repo: Repository<Warranty>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    private movementsService: MovementsService,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateWarrantyDto) {
    const asset = await this.assetRepo.findOne({ where: { assetId: dto.assetId } });
    if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('endDate ต้องมาหลัง startDate');
    }

    const warranty = await this.repo.save(
      this.repo.create({ ...dto, startDate, endDate, status: WarrantyStatus.ACTIVE }),
    );

    asset.warrantyExpireDate = warranty.endDate;
    await this.assetRepo.save(asset);

    return warranty;
  }

  findByAsset(assetId: number) {
    return this.repo.find({ where: { assetId }, order: { endDate: 'DESC' } });
  }

  /**
   * ประกันที่ active อยู่และจะหมดอายุภายใน withinDays วัน — เดิมมีแค่ cron (notifyExpiringWarranties)
   * คำนวณ 30 วันล่วงหน้าไว้ส่ง notification แต่ไม่มีหน้าให้ it_admin เข้ามา browse ดูล่วงหน้าเองได้เลย
   * ต้องค้นทีละ asset ผ่าน findByAsset() เท่านั้น จึงเพิ่ม endpoint นี้ให้ list ดูได้ตรงๆ
   */
  findExpiring(withinDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    return this.repo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.asset', 'asset')
      .leftJoinAndSelect('w.vendor', 'vendor')
      .where('w.status = :status', { status: WarrantyStatus.ACTIVE })
      .andWhere('w.endDate <= :cutoff', { cutoff })
      .orderBy('w.endDate', 'ASC')
      .getMany();
  }

  async findOne(id: number) {
    const w = await this.repo.findOne({ where: { warrantyId: id }, relations: ['asset', 'vendor'] });
    if (!w) throw new NotFoundException(`ไม่พบข้อมูลประกัน id ${id}`);
    return w;
  }

  async renew(id: number, dto: RenewWarrantyDto, performedBy: number) {
    const warranty = await this.findOne(id);
    const newEndDate = new Date(dto.newEndDate);
    if (newEndDate <= warranty.endDate) {
      throw new BadRequestException('newEndDate ต้องมาหลังวันหมดอายุเดิมของประกัน (ไม่สามารถต่อประกันย้อนหลังได้)');
    }

    return this.dataSource.transaction(async (manager) => {
      warranty.endDate = newEndDate;
      warranty.status = WarrantyStatus.RENEWED;
      await manager.save(warranty);

      const asset = await manager.findOne(Asset, { where: { assetId: warranty.assetId } });
      if (asset) {
        asset.warrantyExpireDate = warranty.endDate;
        await manager.save(asset);

        await this.movementsService.log(
          {
            assetId: asset.assetId,
            movementType: MovementType.WARRANTY_RENEWED,
            referenceType: 'warranty',
            referenceId: warranty.warrantyId,
            performedBy,
            notes: `ต่อประกันถึง ${dto.newEndDate}`,
          },
          manager,
        );
      }

      return warranty;
    });
  }
}
