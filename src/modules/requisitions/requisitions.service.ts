import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Requisition } from './entities/requisition.entity';
import { RequisitionItem } from './entities/requisition-item.entity';
import { RequisitionApproval } from './entities/requisition-approval.entity';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { ApproveRequisitionDto } from './dto/approve-requisition.dto';
import { ApprovalStatus } from '@common/enums';

/**
 * Multi-level approval: สร้าง requisition_approvals หนึ่งแถวต่อ 1 approver ตามลำดับ (approverIds[0] = level 1, ...)
 * requisition จะเปลี่ยนเป็น approved ก็ต่อเมื่อ "ทุกระดับ" approve ครบ, ถ้ามีระดับใดถูก reject → requisition = rejected ทันที
 */
@Injectable()
export class RequisitionsService {
  constructor(
    @InjectRepository(Requisition) private repo: Repository<Requisition>,
    @InjectRepository(RequisitionItem) private itemRepo: Repository<RequisitionItem>,
    @InjectRepository(RequisitionApproval) private approvalRepo: Repository<RequisitionApproval>,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateRequisitionDto) {
    return this.dataSource.transaction(async (manager) => {
      const requisition = manager.create(Requisition, {
        requisitionNo: dto.requisitionNo,
        requestedBy: dto.requestedBy,
        requestType: dto.requestType,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        reason: dto.reason,
        overallStatus: ApprovalStatus.PENDING,
      });
      await manager.save(requisition);

      const items = dto.items.map((i) =>
        manager.create(RequisitionItem, { ...i, requisitionId: requisition.requisitionId }),
      );
      await manager.save(items);

      const approvals = dto.approverIds.map((approverId, idx) =>
        manager.create(RequisitionApproval, {
          requisitionId: requisition.requisitionId,
          approvalLevel: idx + 1,
          approverId,
          status: ApprovalStatus.PENDING,
        }),
      );
      await manager.save(approvals);

      const created = await manager.findOne(Requisition, {
        where: { requisitionId: requisition.requisitionId },
        relations: ['requestedByEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
      });
      if (!created) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${requisition.requisitionId}`);
      return created;
    });
  }

  findAll() {
    return this.repo.find({
      relations: ['requestedByEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
      order: { requisitionId: 'DESC' },
    });
  }

  async findOne(id: number) {
    const r = await this.repo.findOne({
      where: { requisitionId: id },
      relations: ['requestedByEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
    });
    if (!r) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${id}`);
    return r;
  }

  async approve(id: number, dto: ApproveRequisitionDto) {
    if (dto.status === ApprovalStatus.PENDING) throw new BadRequestException('status ต้องเป็น approved หรือ rejected');

    const requisition = await this.findOne(id);
    if (requisition.overallStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('ใบขอนี้ถูกอนุมัติ/ปฏิเสธไปแล้ว');
    }

    // หา approval ระดับถัดไปที่ยัง pending อยู่ (บังคับอนุมัติตามลำดับชั้น)
    const pendingApprovals = requisition.approvals
      .filter((a) => a.status === ApprovalStatus.PENDING)
      .sort((a, b) => a.approvalLevel - b.approvalLevel);
    const currentLevel = pendingApprovals[0];

    if (!currentLevel || currentLevel.approverId !== dto.approverId) {
      throw new ForbiddenException('ไม่ใช่ลำดับการอนุมัติของคุณ หรือไม่มีสิทธิ์อนุมัติใบนี้');
    }

    currentLevel.status = dto.status;
    currentLevel.actionedAt = new Date();
    currentLevel.comment = dto.comment ?? null;
    await this.approvalRepo.save(currentLevel);

    if (dto.status === ApprovalStatus.REJECTED) {
      requisition.overallStatus = ApprovalStatus.REJECTED;
      await this.repo.save(requisition);
    } else {
      const stillPending = requisition.approvals.some(
        (a) => a.approvalLevel !== currentLevel.approvalLevel && a.status === ApprovalStatus.PENDING,
      );
      if (!stillPending) {
        requisition.overallStatus = ApprovalStatus.APPROVED;
        await this.repo.save(requisition);
      }
    }

    return this.findOne(id);
  }
}
