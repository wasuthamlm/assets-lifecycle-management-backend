import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Disposal } from './entities/disposal.entity';
import { Asset } from '../assets/entities/asset.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { CreateDisposalDto } from './dto/create-disposal.dto';
import { QueryDisposalDto } from './dto/query-disposal.dto';
import { AssetStatus, MovementType } from '@common/enums';
import { MovementsService } from '../movements/movements.service';
import { assertAssetStatus } from '@common/utils/assert-asset-status.util';

/**
 * จำหน่ายทิ้ง = ปลายทางสุดท้ายของ asset lifecycle
 * asset_id เป็น unique ใน disposals (1 asset จำหน่ายได้ครั้งเดียว) — กันจำหน่ายซ้ำด้วย findOne guard
 */
@Injectable()
export class DisposalService {
  constructor(
    @InjectRepository(Disposal) private repo: Repository<Disposal>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    @InjectRepository(Assignment) private assignmentRepo: Repository<Assignment>,
    private movementsService: MovementsService,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateDisposalDto, approvedBy: number) {
    return this.dataSource.transaction(async (manager) => {
      const asset = await manager.findOne(Asset, {
        where: { assetId: dto.assetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);
      // ไม่อนุญาตจำหน่ายทิ้งขณะ UNDER_REPAIR — ถ้างานซ่อมนั้นปิดงานทีหลังด้วยผลซ่อมสำเร็จ
      // (ดู RepairsService.updateStatus CLOSED) asset จะถูกเซ็ตกลับเป็น IN_STOCK ทับสถานะ DISPOSED
      // ทำให้ของที่มี disposal record อยู่แล้วกลับมาเบิกจ่ายได้อีก ต้องให้ปิดงานซ่อมก่อนจึงจำหน่ายทิ้งได้
      assertAssetStatus(
        asset,
        [AssetStatus.IN_STOCK, AssetStatus.EXPIRED, AssetStatus.IN_TRANSIT],
        'จำหน่ายทิ้งทรัพย์สินนี้',
      );

      const existing = await manager.findOne(Disposal, { where: { assetId: dto.assetId } });
      if (existing) throw new BadRequestException('ทรัพย์สินชิ้นนี้ถูกจำหน่ายทิ้งไปแล้ว');

      // กันจำหน่ายทิ้งทรัพย์สินที่ยังมีคนถือครองอยู่ (ยังไม่คืน) — ต้องคืนก่อนถึงจะจำหน่ายทิ้งได้
      const openAssignment = await manager.findOne(Assignment, {
        where: { assetId: dto.assetId, returnedDate: IsNull() },
      });
      if (openAssignment) {
        throw new ConflictException(
          `ทรัพย์สินนี้ยังถูกเบิก/ยืมอยู่ (assignment id ${openAssignment.assignmentId}) ต้องรับคืนก่อนจึงจะจำหน่ายทิ้งได้`,
        );
      }

      const disposal = manager.create(Disposal, { ...dto, approvedBy, disposalDate: new Date(dto.disposalDate) });
      await manager.save(disposal);

      asset.currentStatus = AssetStatus.DISPOSED;
      asset.currentHolderType = null;
      asset.currentHolderId = null;
      await manager.save(asset);

      await this.movementsService.log(
        {
          assetId: asset.assetId,
          movementType: MovementType.DISPOSED,
          referenceType: 'disposal',
          referenceId: disposal.disposalId,
          performedBy: approvedBy,
          notes: `วิธีจำหน่าย: ${dto.disposalMethod}${dto.reason ? ' — ' + dto.reason : ''}`,
        },
        manager,
      );

      return disposal;
    });
  }

  /**
   * เดิม fetch ทั้งหมดไม่มี pagination/search — relation `asset` เป็น ManyToOne จึง
   * leftJoinAndSelect + skip/take ในคิวรีเดียวได้เลย ไม่เสี่ยง row-multiplication
   */
  findAll(query: QueryDisposalDto) {
    const qb = this.repo.createQueryBuilder('d').leftJoinAndSelect('d.asset', 'asset');

    if (query.search) {
      qb.andWhere('(asset.assetName ILIKE :s OR asset.assetNo ILIKE :s)', { s: `%${query.search}%` });
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.orderBy('d.disposalId', 'DESC').skip((page - 1) * limit).take(limit);

    return qb.getManyAndCount().then(([data, total]) => ({ data, total, page, limit }));
  }

  async findOne(id: number) {
    const d = await this.repo.findOne({ where: { disposalId: id }, relations: ['asset', 'approvedByEmployee'] });
    if (!d) throw new NotFoundException(`ไม่พบข้อมูลจำหน่ายทิ้ง id ${id}`);
    return d;
  }
}
