import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Disposal } from './entities/disposal.entity';
import { Asset } from '../assets/entities/asset.entity';
import { CreateDisposalDto } from './dto/create-disposal.dto';
import { AssetStatus, MovementType } from '@common/enums';
import { MovementsService } from '../movements/movements.service';

/**
 * จำหน่ายทิ้ง = ปลายทางสุดท้ายของ asset lifecycle
 * asset_id เป็น unique ใน disposals (1 asset จำหน่ายได้ครั้งเดียว) — กันจำหน่ายซ้ำด้วย findOne guard
 */
@Injectable()
export class DisposalService {
  constructor(
    @InjectRepository(Disposal) private repo: Repository<Disposal>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    private movementsService: MovementsService,
  ) {}

  async create(dto: CreateDisposalDto) {
    const asset = await this.assetRepo.findOne({ where: { assetId: dto.assetId } });
    if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);

    const existing = await this.repo.findOne({ where: { assetId: dto.assetId } });
    if (existing) throw new BadRequestException('ทรัพย์สินชิ้นนี้ถูกจำหน่ายทิ้งไปแล้ว');

    const disposal = await this.repo.save(
      this.repo.create({ ...dto, disposalDate: new Date(dto.disposalDate) }),
    );

    asset.currentStatus = AssetStatus.DISPOSED;
    asset.currentHolderType = null;
    asset.currentHolderId = null;
    await this.assetRepo.save(asset);

    await this.movementsService.log({
      assetId: asset.assetId,
      movementType: MovementType.DISPOSED,
      referenceType: 'disposal',
      referenceId: disposal.disposalId,
      performedBy: dto.approvedBy,
      notes: `วิธีจำหน่าย: ${dto.disposalMethod}${dto.reason ? ' — ' + dto.reason : ''}`,
    });

    return disposal;
  }

  findAll() {
    return this.repo.find({ relations: ['asset'], order: { disposalId: 'DESC' } });
  }

  async findOne(id: number) {
    const d = await this.repo.findOne({ where: { disposalId: id }, relations: ['asset', 'approvedByEmployee'] });
    if (!d) throw new NotFoundException(`ไม่พบข้อมูลจำหน่ายทิ้ง id ${id}`);
    return d;
  }
}
