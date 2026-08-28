import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Requisition } from './entities/requisition.entity';
import { RequisitionItem } from './entities/requisition-item.entity';
import { RequisitionApproval } from './entities/requisition-approval.entity';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { ApproveRequisitionDto } from './dto/approve-requisition.dto';
import { QueryRequisitionDto } from './dto/query-requisition.dto';
import { ApprovalStatus, AssignmentType, HolderType, NotificationType, RequestType } from '@common/enums';
import { generateSequentialNumber } from '@common/utils/sequential-number.util';
import { NotificationsService } from '../notifications/notifications.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AssignmentsService } from '../assignments/assignments.service';

/**
 * Multi-level approval: สร้าง requisition_approvals หนึ่งแถวต่อ 1 approver ตามลำดับ (approverIds[0] = level 1, ...)
 * requisition จะเปลี่ยนเป็น approved ก็ต่อเมื่อ "ทุกระดับ" approve ครบ, ถ้ามีระดับใดถูก reject → requisition = rejected ทันที
 */
@Injectable()
export class RequisitionsService {
  private readonly logger = new Logger(RequisitionsService.name);

  constructor(
    @InjectRepository(Requisition) private repo: Repository<Requisition>,
    @InjectRepository(RequisitionItem) private itemRepo: Repository<RequisitionItem>,
    @InjectRepository(RequisitionApproval) private approvalRepo: Repository<RequisitionApproval>,
    private dataSource: DataSource,
    private notifications: NotificationsService,
    private attachments: AttachmentsService,
    private assignments: AssignmentsService,
  ) {}

  // เลขที่เอกสารแยก sequence กันคนละ prefix ตามประเภทคำขอ — เบิก (withdraw) รันเลขแยกจากยืม (borrow)
  // ไม่ padding เลขนำหน้าด้วยศูนย์ (Req-Equipment-1, Req-Equipment-2, ... ไม่ใช่ 0001)
  private prefixForRequestType(requestType: RequestType): string {
    return requestType === RequestType.WITHDRAW ? 'Req-Equipment-' : 'Req-Borrow-';
  }

  private generateRequisitionNo(manager: EntityManager, requestType: RequestType): Promise<string> {
    return generateSequentialNumber(manager, Requisition, 'requisitionNo', this.prefixForRequestType(requestType), 1);
  }

  /**
   * Preview เลขที่เอกสารถัดไปให้ฟอร์มแสดงก่อนบันทึกจริง — ไม่ lock/จองเลข เลขจริงคำนวณอีกครั้งตอน create()
   * ดึงทุกแถวมาเทียบเป็นตัวเลขใน JS แทน ORDER BY string DESC — ไม่มี padding เลข ORDER BY แบบ string จะผิดหลังเลขเกิน 9
   */
  async peekNextRequisitionNo(requestType: RequestType): Promise<string> {
    const prefix = this.prefixForRequestType(requestType);
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.requisitionNo', 'value')
      .where('r.requisitionNo LIKE :prefix', { prefix: `${prefix}%` })
      .getRawMany<{ value: string }>();
    const maxSeq = rows.reduce((max, row) => {
      const n = parseInt(row.value.replace(prefix, ''), 10);
      return Number.isNaN(n) ? max : Math.max(max, n);
    }, 0);
    return `${prefix}${maxSeq + 1}`;
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

    const created = await this.dataSource.transaction(async (manager) => {
      const requisitionNo = await this.generateRequisitionNo(manager, dto.requestType);
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

      const found = await manager.findOne(Requisition, {
        where: { requisitionId: requisition.requisitionId },
        relations: ['requestedByEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
      });
      if (!found) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${requisition.requisitionId}`);
      return found;
    });

    // แจ้งเตือนต้องอยู่นอก transaction เสมอ — ใช้ connection คนละตัวจาก manager (ผ่าน this.repo ปกติ)
    // และอาจ await ส่งอีเมล ถ้าอยู่ในนี้จะกัน connection ของ transaction ค้างไว้โดยไม่จำเป็น
    await this.notifications.notify(
      dto.approverIds[0],
      NotificationType.REQUISITION_PENDING_APPROVAL,
      'มีใบขอเบิก/ยืมรออนุมัติ',
      `ใบขอ ${created.requisitionNo} รอการอนุมัติจากคุณ`,
      'requisition',
      created.requisitionId,
    );

    return created;
  }

  findAll(query: QueryRequisitionDto) {
    return this.queryWithFilters(query);
  }

  findMine(requestedBy: number, query: QueryRequisitionDto) {
    return this.queryWithFilters(query, requestedBy);
  }

  /**
   * แบ่งเป็น 2 รอบ: รอบแรกกรอง/นับ/แบ่งหน้าบน requisition ล้วนๆ (ไม่ join items/approvals เข้ามาใน
   * query นี้) เพราะ items/approvals เป็น one-to-many — ถ้า leftJoinAndSelect เข้ามาตรงนี้ตั้งแต่แรก
   * แถวจะถูกคูณจาก join ทำให้ skip/take และ total นับผิดเพี้ยน (deep-pagination bug แบบคลาสสิกของ TypeORM)
   * รอบสองค่อยดึง relations แบบเต็มเฉพาะ id ที่ได้จากหน้านี้เท่านั้น
   */
  private async queryWithFilters(query: QueryRequisitionDto, requestedBy?: number) {
    const qb = this.repo.createQueryBuilder('r');

    if (requestedBy != null) qb.andWhere('r.requestedBy = :requestedBy', { requestedBy });
    if (query.search) {
      // join แค่นี้ (ไม่ leftJoinAndSelect) เพราะรอบนี้ใช้แค่กรอง/นับ ไม่ได้ดึงข้อมูล employee มาด้วย
      qb.leftJoin('r.requestedByEmployee', 'requester');
      qb.andWhere('(r.requisitionNo ILIKE :s OR r.reason ILIKE :s OR requester.fullName ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }
    if (query.status) qb.andWhere('r.overallStatus = :status', { status: query.status });
    if (query.requestType) qb.andWhere('r.requestType = :requestType', { requestType: query.requestType });
    if (query.dateFrom) qb.andWhere('r.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('r.createdAt <= :dateTo', { dateTo: `${query.dateTo} 23:59:59` });

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.orderBy('r.requisitionId', 'DESC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    if (rows.length === 0) return { data: [], total, page, limit };

    const ids = rows.map((r) => r.requisitionId);
    const withRelations = await this.repo.find({
      where: { requisitionId: In(ids) },
      relations: ['requestedByEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
    });
    // find() ไม่การันตี order ตาม ids ที่ส่งเข้าไป — เรียงกลับตาม order ของหน้านี้ (requisitionId DESC) เอง
    const byId = new Map(withRelations.map((r) => [r.requisitionId, r]));
    const data = ids.map((id) => byId.get(id)!);

    return { data, total, page, limit };
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

  /**
   * ไฟล์แนบของใบขอเบิก/ยืม ผูก privacy กับใบขอโดยตรง — เป็นของ "ใบขอ" ไม่ใช่ของ "ไฟล์แนบทั่วไป"
   * จึงไม่ใช้ permission attachment.view/attachment.manage (จะเปิดกว้างเกินไป เพราะเป็น permission
   * ระดับ global ไม่ผูก ownership) แต่ reuse findOne() ด้านบนตรงๆ (เจ้าของใบขอ หรือคนมี requisition.view_all
   * เท่านั้นถึงจะเห็น/แนบ/ลบไฟล์ได้) เหมือนแพทเทิร์นของ notifications ที่ scope ผูกกับ CurrentUser เสมอ
   */
  async listAttachments(id: number, currentUser: { employeeId: number | null; permissions: string[] }) {
    await this.findOne(id, currentUser);
    return this.attachments.findByReference('requisition', id);
  }

  async uploadAttachment(
    id: number,
    file: Express.Multer.File,
    currentUser: { employeeId: number | null; permissions: string[] },
    uploadedBy: number,
  ) {
    await this.findOne(id, currentUser);
    return this.attachments.saveUpload(file, { referenceType: 'requisition', referenceId: id }, uploadedBy);
  }

  async removeAttachment(
    id: number,
    attachmentId: number,
    currentUser: { employeeId: number | null; permissions: string[] },
  ) {
    await this.findOne(id, currentUser);
    // ต้องเช็คว่า attachmentId นี้เป็นของใบขอ id นี้จริง ไม่งั้นเจ้าของใบขอ A เดา id แล้วลบไฟล์แนบของใบขอ B ได้
    const ownAttachments = await this.attachments.findByReference('requisition', id);
    if (!ownAttachments.some((a) => a.attachmentId === attachmentId)) {
      throw new NotFoundException(`ไม่พบไฟล์แนบ id ${attachmentId} ในใบขอนี้`);
    }
    return this.attachments.remove(attachmentId);
  }

  async approve(id: number, dto: ApproveRequisitionDto, approverId: number) {
    if (dto.status === ApprovalStatus.PENDING) throw new BadRequestException('status ต้องเป็น approved หรือ rejected');

    // แจ้งเตือนที่ต้องส่งหลัง commit (เก็บไว้เรียกนอก transaction เหมือน create() — กันต่อ connection ค้าง
    // โดยไม่จำเป็นถ้า mail ช้า และกันแจ้งเตือนถูกส่งไปทั้งที่ transaction จะ rollback ทีหลัง)
    let notifyArgs: [number, NotificationType, string, string, string, number];

    await this.dataSource.transaction(async (manager) => {
      // ล็อกแถว requisition ตลอด transaction กันอนุมัติ/ปฏิเสธซ้ำซ้อนเมื่อมี 2 request เข้ามาพร้อมกัน
      // (ดับเบิลคลิก หรือ 2 คนกดพร้อมกัน) — เดิมอ่านสถานะแบบ read-then-write ก่อนเปิด transaction ทำให้
      // 2 request ที่มาพร้อมกันอ่านเห็น PENDING เหมือนกันทั้งคู่แล้ว commit ผ่านทั้งคู่ได้ (แพทเทิร์นเดียวกับ
      // บั๊กที่เคยแก้ไปแล้วใน AssignmentsService.issue())
      const requisition = await manager.findOne(Requisition, {
        where: { requisitionId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!requisition) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${id}`);
      if (requisition.overallStatus !== ApprovalStatus.PENDING) {
        throw new BadRequestException('ใบขอนี้ถูกอนุมัติ/ปฏิเสธไปแล้ว');
      }

      // ต้องอ่าน approvals ผ่าน manager (ไม่ใช่ this.approvalRepo) ให้อยู่ใน transaction เดียวกับ lock
      // ด้านบน ไม่งั้นจะได้ snapshot เก่าจาก connection คนละตัว
      const approvals = await manager.find(RequisitionApproval, {
        where: { requisitionId: id },
        order: { approvalLevel: 'ASC' },
      });

      // หา approval ระดับถัดไปที่ยัง pending อยู่ (บังคับอนุมัติตามลำดับชั้น)
      const currentLevel = approvals.find((a) => a.status === ApprovalStatus.PENDING);

      if (!currentLevel || currentLevel.approverId !== approverId) {
        throw new ForbiddenException('ไม่ใช่ลำดับการอนุมัติของคุณ หรือไม่มีสิทธิ์อนุมัติใบนี้');
      }

      currentLevel.status = dto.status;
      currentLevel.actionedAt = new Date();
      currentLevel.comment = dto.comment ?? null;
      await manager.save(currentLevel);

      if (dto.status === ApprovalStatus.REJECTED) {
        requisition.overallStatus = ApprovalStatus.REJECTED;
        await manager.save(requisition);
        notifyArgs = [
          requisition.requestedBy,
          NotificationType.REQUISITION_REJECTED,
          'ใบขอเบิก/ยืมถูกปฏิเสธ',
          `ใบขอ ${requisition.requisitionNo} ถูกปฏิเสธ`,
          'requisition',
          requisition.requisitionId,
        ];
      } else {
        const nextLevel = approvals
          .filter((a) => a.approvalLevel !== currentLevel.approvalLevel && a.status === ApprovalStatus.PENDING)
          .sort((a, b) => a.approvalLevel - b.approvalLevel)[0];

        if (!nextLevel) {
          requisition.overallStatus = ApprovalStatus.APPROVED;
          await manager.save(requisition);
          notifyArgs = [
            requisition.requestedBy,
            NotificationType.REQUISITION_APPROVED,
            'ใบขอเบิก/ยืมได้รับการอนุมัติแล้ว',
            `ใบขอ ${requisition.requisitionNo} ได้รับการอนุมัติครบทุกระดับแล้ว`,
            'requisition',
            requisition.requisitionId,
          ];
        } else {
          notifyArgs = [
            nextLevel.approverId,
            NotificationType.REQUISITION_PENDING_APPROVAL,
            'มีใบขอเบิก/ยืมรออนุมัติ',
            `ใบขอ ${requisition.requisitionNo} รอการอนุมัติจากคุณ`,
            'requisition',
            requisition.requisitionId,
          ];
        }
      }
    });

    await this.notifications.notify(...notifyArgs!);

    const result = await this.getByIdOrThrow(id);
    if (result.overallStatus === ApprovalStatus.APPROVED) {
      await this.autoIssueApprovedItems(result, approverId);
    }

    return this.getByIdOrThrow(id);
  }

  /**
   * พออนุมัติครบทุกระดับแล้ว จ่ายทรัพย์สินที่เป็น serialized asset (มี assetId) ให้ผู้ขอทันที — ไม่งั้นต้อง
   * พึ่งให้ IT/HR จำได้เองว่าต้องไปกดจ่ายแยกที่หน้า /assignments ซึ่งลืมง่ายมาก (ของแบบ stock_item/consumable
   * ไม่เกี่ยวกับ Assignment เลย ข้ามไป — จัดการผ่านระบบ stock แยกต่างหาก)
   *
   * best-effort เหมือน NotificationsService.notify() — ถ้าจ่ายไม่สำเร็จ (เช่น asset ดันไม่ IN_STOCK แล้วเพราะ
   * ถูกจัดการไปทางอื่นก่อนหน้าพอดี) แค่ log ไว้ ไม่ throw ทับ response การอนุมัติที่ commit สำเร็จไปแล้วจริง —
   * ต้องให้ admin ไปจ่ายเองทีหลังผ่าน /assignments แทน
   */
  private async autoIssueApprovedItems(requisition: Requisition, issuedBy: number) {
    const items = await this.itemRepo.find({ where: { requisitionId: requisition.requisitionId } });
    const assignmentType =
      requisition.requestType === RequestType.BORROW ? AssignmentType.TEMPORARY_LOAN : AssignmentType.PERMANENT;

    for (const item of items) {
      if (!item.assetId) continue;
      try {
        await this.assignments.issue(
          {
            assetId: item.assetId,
            requisitionId: requisition.requisitionId,
            assignmentType,
            holderType: HolderType.EMPLOYEE,
            holderId: requisition.requestedBy,
            dueDate: requisition.dueDate ? new Date(requisition.dueDate).toISOString().slice(0, 10) : undefined,
          },
          issuedBy,
        );
      } catch (err) {
        this.logger.warn(
          `จ่ายทรัพย์สิน asset_id=${item.assetId} อัตโนมัติไม่สำเร็จหลังอนุมัติใบขอ ${requisition.requisitionNo}: ${(err as Error).message}`,
        );
      }
    }
  }
}
