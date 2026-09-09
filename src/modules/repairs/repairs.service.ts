import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Repair } from './entities/repair.entity';
import { Asset } from '../assets/entities/asset.entity';
import { CreateRepairDto } from './dto/create-repair.dto';
import { UpdateRepairStatusDto } from './dto/update-repair-status.dto';
import { QueryRepairDto } from './dto/query-repair.dto';
import { AssetStatus, MovementType, RepairResult, RepairStatus } from '@common/enums';
import { MovementsService } from '../movements/movements.service';
import { assertAssetStatus } from '@common/utils/assert-asset-status.util';

/**
 * แจ้งซ่อม -> asset.current_status = under_repair ทันที
 * ปิดงาน (status = closed) -> คืนสถานะ asset กลับเป็น in_stock (หรือ disposed ถ้า unrepairable)
 * ทุกจุดเปลี่ยนสถานะเขียน movement log กำกับเสมอ (sent_to_repair / returned_from_repair)
 */
const REPAIR_STATUS_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  [RepairStatus.REPORTED]: [RepairStatus.REPAIRING, RepairStatus.SENT_TO_VENDOR, RepairStatus.REPAIRED],
  [RepairStatus.REPAIRING]: [RepairStatus.SENT_TO_VENDOR, RepairStatus.REPAIRED],
  [RepairStatus.SENT_TO_VENDOR]: [RepairStatus.REPAIRED],
  [RepairStatus.REPAIRED]: [RepairStatus.CLOSED],
  [RepairStatus.CLOSED]: [],
};

@Injectable()
export class RepairsService {
  constructor(
    @InjectRepository(Repair) private repo: Repository<Repair>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    private movementsService: MovementsService,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateRepairDto, reportedBy: number) {
    return this.dataSource.transaction(async (manager) => {
      const asset = await manager.findOne(Asset, {
        where: { assetId: dto.assetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);
      // กันแจ้งซ่อมทรัพย์สินที่จำหน่ายทิ้งไปแล้ว หรือกำลังอยู่ระหว่างซ่อมอยู่แล้ว (เปิดงานซ่อมซ้อนกัน)
      assertAssetStatus(asset, [AssetStatus.IN_STOCK, AssetStatus.ASSIGNED], 'แจ้งซ่อมทรัพย์สินนี้');

      const repair = manager.create(Repair, { ...dto, reportedBy, status: RepairStatus.REPORTED });
      await manager.save(repair);

      asset.currentStatus = AssetStatus.UNDER_REPAIR;
      await manager.save(asset);

      await this.movementsService.log(
        {
          assetId: asset.assetId,
          movementType: MovementType.SENT_TO_REPAIR,
          referenceType: 'repair',
          referenceId: repair.repairId,
          performedBy: reportedBy,
          notes: dto.problemDescription,
        },
        manager,
      );

      return repair;
    });
  }

  /**
   * เดิม fetch ทั้งหมดไม่มี pagination/search — ทุก relation ที่นี่เป็น ManyToOne (asset, vendor) จึง
   * leftJoinAndSelect + skip/take ในคิวรีเดียวได้เลย ไม่เสี่ยง row-multiplication
   */
  findAll(query: QueryRepairDto) {
    const qb = this.repo.createQueryBuilder('r').leftJoinAndSelect('r.asset', 'asset').leftJoinAndSelect('r.vendor', 'vendor');

    if (query.search) {
      qb.andWhere('(asset.assetName ILIKE :s OR asset.assetNo ILIKE :s OR r.problemDescription ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.orderBy('r.repairId', 'DESC').skip((page - 1) * limit).take(limit);

    return qb.getManyAndCount().then(([data, total]) => ({ data, total, page, limit }));
  }

  async findOne(id: number) {
    const r = await this.repo.findOne({ where: { repairId: id }, relations: ['asset', 'vendor'] });
    if (!r) throw new NotFoundException(`ไม่พบงานซ่อม id ${id}`);
    return r;
  }

  async updateStatus(id: number, dto: UpdateRepairStatusDto) {
    return this.dataSource.transaction(async (manager) => {
      const repair = await manager.findOne(Repair, { where: { repairId: id }, lock: { mode: 'pessimistic_write' } });
      if (!repair) throw new NotFoundException(`ไม่พบงานซ่อม id ${id}`);

      if (dto.status !== repair.status) {
        const allowed = REPAIR_STATUS_TRANSITIONS[repair.status] || [];
        if (!allowed.includes(dto.status)) {
          throw new BadRequestException(`ไม่สามารถเปลี่ยนสถานะงานซ่อมจาก '${repair.status}' เป็น '${dto.status}' ได้`);
        }
      }

      repair.status = dto.status;
      if (dto.result) repair.result = dto.result;
      if (dto.repairCost !== undefined) repair.repairCost = dto.repairCost;
      if (dto.notes) repair.notes = dto.notes;

      if (dto.status === RepairStatus.SENT_TO_VENDOR) repair.sentToVendorDate = new Date();
      if (dto.status === RepairStatus.REPAIRED) repair.repairedDate = new Date();

      await manager.save(repair);

      if (dto.status === RepairStatus.CLOSED) {
        const asset = await manager.findOne(Asset, {
          where: { assetId: repair.assetId },
          lock: { mode: 'pessimistic_write' },
        });
        if (asset) {
          asset.currentStatus =
            dto.result === RepairResult.UNREPAIRABLE ? AssetStatus.DISPOSED : AssetStatus.IN_STOCK;
          await manager.save(asset);

          await this.movementsService.log(
            {
              assetId: asset.assetId,
              movementType: MovementType.RETURNED_FROM_REPAIR,
              referenceType: 'repair',
              referenceId: repair.repairId,
              performedBy: repair.reportedBy,
              notes: `ผลซ่อม: ${dto.result || '-'}`,
            },
            manager,
          );
        }
      }

      return repair;
    });
  }
}
