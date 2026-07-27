import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Requisition } from './entities/requisition.entity';
import { RequisitionItem } from './entities/requisition-item.entity';
import { RequisitionApproval } from './entities/requisition-approval.entity';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { ApproveRequisitionDto } from './dto/approve-requisition.dto';
import { ApprovalStatus } from '@common/enums';
import { generateSequentialNumber } from '@common/utils/sequential-number.util';

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

  private generateRequisitionNo(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    return generateSequentialNumber(manager, Requisition, 'requisitionNo', `REQ-${year}-`);
  }

  /** Preview เลขที่เอกสารถัดไปให้ฟอร์มแสดงก่อนบันทึกจริง — ไม่ lock/จองเลข เลขจริงคำนวณอีกครั้งตอน create() */
  async peekNextRequisitionNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REQ-${year}-`;
    const latest = await this.repo
      .createQueryBuilder('r')
      .where('r.requisitionNo LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('r.requisitionNo', 'DESC')
      .getOne();
    const seq = latest ? parseInt(latest.requisitionNo.replace(prefix, ''), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async create(dto: CreateRequisitionDto, requestedBy: number) {
    for (const item of dto.items) {
      const hasAsset = item.assetId != null;
      const hasStock = item.stockItemId != null;
      if (hasAsset === hasStock) {
        throw new BadRequestException('แต่ละรายการต้องระบุ assetId หรือ stockItemId อย่างใดอย่างหนึ่งเท่านั้น');
      }
    }

    const uniqueApprovers = new Set(dto.approverIds);
    if (uniqueApprovers.size !== dto.approverIds.length) {
      throw new BadRequestException('approverIds มีรายชื่อซ้ำกัน');
    }
    if (uniqueApprovers.has(requestedBy)) {
      throw new BadRequestException('ผู้ขอเบิก/ยืมไม่สามารถเป็นผู้อนุมัติของใบขอตัวเองได้');
    }

    return this.dataSource.transaction(async (manager) => {
      const requisitionNo = await this.generateRequisitionNo(manager);
      const requisition = manager.create(Requisition, {
        requisitionNo,
        requestedBy,
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

  findMine(requestedBy: number) {
    return this.repo.find({
      where: { requestedBy },
      relations: ['requestedByEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
      order: { requisitionId: 'DESC' },
    });
  }

  /** ใช้ภายใน service เท่านั้น — ไม่เช็คสิทธิ์การเข้าถึง (ต่างจาก findOne ที่ controller เรียก) */
  private async getByIdOrThrow(id: number) {
    const r = await this.repo.findOne({
      where: { requisitionId: id },
      relations: ['requestedByEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
    });
    if (!r) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${id}`);
    return r;
  }

  /**
   * `requisition.view_own` ตั้งใจให้ดูได้เฉพาะใบของตัวเอง — ต้องเช็ค ownership เทียบกับ
   * requestedBy จริง ไม่ใช่แค่มี permission code นี้แล้วดูใบของใครก็ได้ตาม id
   */
  async findOne(id: number, currentUser: { employeeId: number | null; permissions: string[] }) {
    const r = await this.getByIdOrThrow(id);
    const canViewAll = currentUser.permissions.includes('requisition.view_all');
    if (!canViewAll && r.requestedBy !== currentUser.employeeId) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์ดูใบขอเบิก/ยืมนี้');
    }
    return r;
  }

  async approve(id: number, dto: ApproveRequisitionDto, approverId: number) {
    if (dto.status === ApprovalStatus.PENDING) throw new BadRequestException('status ต้องเป็น approved หรือ rejected');

    const requisition = await this.getByIdOrThrow(id);
    if (requisition.overallStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('ใบขอนี้ถูกอนุมัติ/ปฏิเสธไปแล้ว');
    }

    // หา approval ระดับถัดไปที่ยัง pending อยู่ (บังคับอนุมัติตามลำดับชั้น)
    const pendingApprovals = requisition.approvals
      .filter((a) => a.status === ApprovalStatus.PENDING)
      .sort((a, b) => a.approvalLevel - b.approvalLevel);
    const currentLevel = pendingApprovals[0];

    if (!currentLevel || currentLevel.approverId !== approverId) {
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

    return this.getByIdOrThrow(id);
  }
}
