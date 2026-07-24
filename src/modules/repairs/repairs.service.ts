import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Repair } from './entities/repair.entity';
import { Asset } from '../assets/entities/asset.entity';
import { CreateRepairDto } from './dto/create-repair.dto';
import { UpdateRepairStatusDto } from './dto/update-repair-status.dto';
import { AssetStatus, MovementType, RepairStatus } from '@common/enums';
import { MovementsService } from '../movements/movements.service';

/**
 * แจ้งซ่อม -> asset.current_status = under_repair ทันที
 * ปิดงาน (status = closed) -> คืนสถานะ asset กลับเป็น in_stock (หรือ disposed ถ้า unrepairable)
 * ทุกจุดเปลี่ยนสถานะเขียน movement log กำกับเสมอ (sent_to_repair / returned_from_repair)
 */
@Injectable()
export class RepairsService {
  constructor(
    @InjectRepository(Repair) private repo: Repository<Repair>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    private movementsService: MovementsService,
  ) {}

  async create(dto: CreateRepairDto) {
    const asset = await this.assetRepo.findOne({ where: { assetId: dto.assetId } });
    if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);

    const repair = await this.repo.save(
      this.repo.create({ ...dto, status: RepairStatus.REPORTED }),
    );

    asset.currentStatus = AssetStatus.UNDER_REPAIR;
    await this.assetRepo.save(asset);

    await this.movementsService.log({
      assetId: asset.assetId,
      movementType: MovementType.SENT_TO_REPAIR,
      referenceType: 'repair',
      referenceId: repair.repairId,
      performedBy: dto.reportedBy,
      notes: dto.problemDescription,
    });

    return repair;
  }

  findAll() {
    return this.repo.find({ relations: ['asset', 'vendor'], order: { repairId: 'DESC' } });
  }

  async findOne(id: number) {
    const r = await this.repo.findOne({ where: { repairId: id }, relations: ['asset', 'vendor'] });
    if (!r) throw new NotFoundException(`ไม่พบงานซ่อม id ${id}`);
    return r;
  }

  async updateStatus(id: number, dto: UpdateRepairStatusDto) {
    const repair = await this.findOne(id);
    repair.status = dto.status;
    if (dto.result) repair.result = dto.result;
    if (dto.repairCost !== undefined) repair.repairCost = dto.repairCost;
    if (dto.notes) repair.notes = dto.notes;

    if (dto.status === RepairStatus.SENT_TO_VENDOR) repair.sentToVendorDate = new Date();
    if (dto.status === RepairStatus.REPAIRED) repair.repairedDate = new Date();

    await this.repo.save(repair);

    if (dto.status === RepairStatus.CLOSED) {
      const asset = await this.assetRepo.findOne({ where: { assetId: repair.assetId } });
      if (asset) {
        asset.currentStatus =
          dto.result === 'unrepairable' ? AssetStatus.DISPOSED : AssetStatus.IN_STOCK;
        await this.assetRepo.save(asset);

        await this.movementsService.log({
          assetId: asset.assetId,
          movementType: MovementType.RETURNED_FROM_REPAIR,
          referenceType: 'repair',
          referenceId: repair.repairId,
          performedBy: repair.reportedBy,
          notes: `ผลซ่อม: ${dto.result || '-'}`,
        });
      }
    }

    return repair;
  }
}
