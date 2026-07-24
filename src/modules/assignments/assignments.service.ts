import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Assignment } from './entities/assignment.entity';
import { Asset } from '../assets/entities/asset.entity';
import { IssueAssetDto } from './dto/issue-asset.dto';
import { ReturnAssetDto } from './dto/return-asset.dto';
import { AssetStatus, MovementType, ReturnCondition } from '@common/enums';
import { MovementsService } from '../movements/movements.service';

/**
 * assignment = สถานะ "การถือครองปัจจุบัน" ของ asset หนึ่งชิ้น (มี due date/condition ตอนคืน)
 * ทุก issue/return ที่นี่จะ insert movement คู่กันเสมอ 1:1 ผ่าน MovementsService — ห้ามมี
 * endpoint อื่นแก้ current_holder_* ของ asset ตรงๆ นอกเหนือจากที่นี่ (กัน endpoint ซ้ำซ้อน)
 */
@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment) private repo: Repository<Assignment>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    private movementsService: MovementsService,
    private dataSource: DataSource,
  ) {}

  async issue(dto: IssueAssetDto) {
    const asset = await this.assetRepo.findOne({ where: { assetId: dto.assetId } });
    if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);
    if (asset.currentStatus === AssetStatus.ASSIGNED) {
      throw new BadRequestException('ทรัพย์สินชิ้นนี้ถูกเบิก/ยืมอยู่แล้ว ต้องรับคืนก่อน');
    }

    return this.dataSource.transaction(async (manager) => {
      const assignment = manager.create(Assignment, {
        assetId: dto.assetId,
        requisitionId: dto.requisitionId,
        assignmentType: dto.assignmentType,
        holderType: dto.holderType,
        holderId: dto.holderId,
        issuedDate: new Date(),
        issuedBy: dto.issuedBy,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes,
      });
      await manager.save(assignment);

      const fromLocationId = asset.currentLocationId;
      const fromHolderType = asset.currentHolderType;
      const fromHolderId = asset.currentHolderId;

      asset.currentStatus = AssetStatus.ASSIGNED;
      asset.currentHolderType = dto.holderType;
      asset.currentHolderId = dto.holderId;
      await manager.save(asset);

      await this.movementsService.log({
        assetId: asset.assetId,
        movementType: MovementType.ISSUED,
        fromLocationId,
        toLocationId: asset.currentLocationId,
        fromHolderType,
        fromHolderId,
        toHolderType: dto.holderType,
        toHolderId: dto.holderId,
        referenceType: 'assignment',
        referenceId: assignment.assignmentId,
        performedBy: dto.issuedBy,
        notes: dto.notes,
      });

      return assignment;
    });
  }

  async return_(assignmentId: number, dto: ReturnAssetDto) {
    const assignment = await this.repo.findOne({ where: { assignmentId } });
    if (!assignment) throw new NotFoundException(`ไม่พบ assignment id ${assignmentId}`);
    if (assignment.returnedDate) throw new BadRequestException('assignment นี้ถูกคืนไปแล้ว');

    const asset = await this.assetRepo.findOne({ where: { assetId: assignment.assetId } });
    if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${assignment.assetId}`);

    return this.dataSource.transaction(async (manager) => {
      assignment.returnedDate = new Date();
      assignment.receivedBy = dto.receivedBy;
      assignment.returnCondition = dto.returnCondition;
      if (dto.notes) assignment.notes = dto.notes;
      await manager.save(assignment);

      const fromHolderType = asset.currentHolderType;
      const fromHolderId = asset.currentHolderId;

      asset.currentStatus =
        dto.returnCondition === ReturnCondition.LOST ? AssetStatus.DISPOSED : AssetStatus.IN_STOCK;
      asset.currentHolderType = null;
      asset.currentHolderId = null;
      await manager.save(asset);

      await this.movementsService.log({
        assetId: asset.assetId,
        movementType: MovementType.RETURNED,
        fromHolderType,
        fromHolderId,
        referenceType: 'assignment',
        referenceId: assignment.assignmentId,
        performedBy: dto.receivedBy,
        notes: `คืนสภาพ: ${dto.returnCondition}${dto.notes ? ' — ' + dto.notes : ''}`,
      });

      return assignment;
    });
  }

  findByAsset(assetId: number) {
    return this.repo.find({ where: { assetId }, order: { issuedDate: 'DESC' } });
  }

  async findOne(id: number) {
    const a = await this.repo.findOne({ where: { assignmentId: id } });
    if (!a) throw new NotFoundException(`ไม่พบ assignment id ${id}`);
    return a;
  }
}
