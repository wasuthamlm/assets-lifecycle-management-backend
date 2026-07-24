import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  async create(dto: CreateWarrantyDto) {
    const asset = await this.assetRepo.findOne({ where: { assetId: dto.assetId } });
    if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);

    const warranty = await this.repo.save(
      this.repo.create({
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: WarrantyStatus.ACTIVE,
      }),
    );

    asset.warrantyExpireDate = warranty.endDate;
    await this.assetRepo.save(asset);

    return warranty;
  }

  findByAsset(assetId: number) {
    return this.repo.find({ where: { assetId }, order: { endDate: 'DESC' } });
  }

  async findOne(id: number) {
    const w = await this.repo.findOne({ where: { warrantyId: id }, relations: ['asset', 'vendor'] });
    if (!w) throw new NotFoundException(`ไม่พบข้อมูลประกัน id ${id}`);
    return w;
  }

  async renew(id: number, dto: RenewWarrantyDto) {
    const warranty = await this.findOne(id);
    warranty.endDate = new Date(dto.newEndDate);
    warranty.status = WarrantyStatus.RENEWED;
    await this.repo.save(warranty);

    const asset = await this.assetRepo.findOne({ where: { assetId: warranty.assetId } });
    if (asset) {
      asset.warrantyExpireDate = warranty.endDate;
      await this.assetRepo.save(asset);

      await this.movementsService.log({
        assetId: asset.assetId,
        movementType: MovementType.WARRANTY_RENEWED,
        referenceType: 'warranty',
        referenceId: warranty.warrantyId,
        performedBy: dto.performedBy,
        notes: `ต่อประกันถึง ${dto.newEndDate}`,
      });
    }

    return warranty;
  }
}
