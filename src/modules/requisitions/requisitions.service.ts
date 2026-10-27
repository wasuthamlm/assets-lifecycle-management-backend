import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Raw, Repository } from 'typeorm';
import { Requisition, RequisitionDocumentInfo } from './entities/requisition.entity';
import { RequisitionItem } from './entities/requisition-item.entity';
import { RequisitionApproval } from './entities/requisition-approval.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Asset } from '../assets/entities/asset.entity';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { ApproveRequisitionDto } from './dto/approve-requisition.dto';
import { QueryRequisitionDto } from './dto/query-requisition.dto';
import { ApprovalStatus, AssetStatus, AssignmentType, HolderType, NotificationType, RequestType } from '@common/enums';
import { generateSequentialNumber } from '@common/utils/sequential-number.util';
import { NotificationsService } from '../notifications/notifications.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { renderRequisitionDocumentHtml } from './requisition-document.template';

/**
 * Multi-level approval: สร้าง requisition_approvals หนึ่งแถวต่อ 1 approver ตามลำดับ (approverIds[0] = level 1, ...)
 * ผู้อนุมัติทุกคนต้องเป็นผู้ดูแลระบบ IT (role it_admin) — ถ้า it_admin เป็นผู้ขอหรือผู้รับทรัพย์สินเอง ใบขอจะ
 * อนุมัติอัตโนมัติทันที เพราะอนุมัติใบของตัวเองไม่ได้ (ดู create())
 * requisition จะเปลี่ยนเป็น approved ก็ต่อเมื่อ "ทุกระดับ" approve ครบ, ถ้ามีระดับใดถูก reject → requisition = rejected ทันที
 */
@Injectable()
export class RequisitionsService {
  private readonly logger = new Logger(RequisitionsService.name);

  private static readonly RELATIONS = [
    'requestedByEmployee',
    'requestedByEmployee.department',
    'requestedByEmployee.department.company',
    'requestedForEmployee',
    'requestedForEmployee.department',
    'requestedForEmployee.department.company',
    'items',
    'items.asset',
    'items.stockItem',
    'approvals',
    'approvals.approver',
  ];

  constructor(
    @InjectRepository(Requisition) private repo: Repository<Requisition>,
    @InjectRepository(RequisitionItem) private itemRepo: Repository<RequisitionItem>,
    @InjectRepository(RequisitionApproval) private approvalRepo: Repository<RequisitionApproval>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
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
   * Preview เลขที่เอกสารถัดไปให้หน้าสร้างใบขอใช้แสดง — ไม่ lock/จองเลข เลขจริงคำนวณอีกครั้งตอน create()
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

  private buildDocumentInfo(dto: CreateRequisitionDto, requester: Employee | null): RequisitionDocumentInfo {
    return {
      employeeNameEn: dto.employeeNameEn ?? null,
      startDate: dto.startDate ?? null,
      position: dto.position ?? requester?.position ?? null,
      department: dto.department ?? requester?.department?.departmentName ?? null,
      contactPhone: dto.contactPhone ?? requester?.phone ?? null,
      accessories: dto.accessories
        ? {
            adapter: dto.accessories.adapter ?? false,
            mouse: dto.accessories.mouse ?? false,
            pen: dto.accessories.pen ?? false,
            bag: dto.accessories.bag ?? false,
            other: dto.accessories.other ?? null,
          }
        : null,
    };
  }

  async create(dto: CreateRequisitionDto, currentUser: { employeeId: number; permissions: string[] }) {
    // ผู้ขอเบิกคือคนที่ทำรายการเสมอ (HR ที่เบิกให้คนอื่นก็ยังเป็นผู้ขอ) — ส่วนผู้รับทรัพย์สินเก็บแยกใน requestedFor
    const requestedBy = currentUser.employeeId;
    let requestedFor: number | null = null;
    const newEmployee = dto.newEmployee
      ? {
          ...dto.newEmployee,
          employeeCode: dto.newEmployee.employeeCode.trim(),
          fullName: dto.newEmployee.fullName.trim(),
          email: dto.newEmployee.email?.trim().toLowerCase() || undefined,
        }
      : null;
    if (newEmployee) {
      if (dto.onBehalfOfEmployeeId != null) {
        throw new BadRequestException('ระบุผู้ขอเบิกได้แบบเดียว: เลือกพนักงานในระบบ หรือ กรอกพนักงานใหม่');
      }
      if (!currentUser.permissions.includes('requisition.create_on_behalf')) {
        throw new ForbiddenException('พนักงานทั่วไปเบิก/ยืมได้เฉพาะให้ตัวเองเท่านั้น — การเบิกให้พนักงานใหม่ต้องทำโดย HR / IT admin');
      }
      const sameCode = await this.employeeRepo.findOne({ where: { employeeCode: newEmployee.employeeCode } });
      if (sameCode) {
        throw new ConflictException(`รหัสพนักงาน ${newEmployee.employeeCode} มีในระบบแล้ว — เลือกจากรายชื่อพนักงานแทน`);
      }
      if (newEmployee.email) {
        const sameEmail = await this.employeeRepo.findOne({
          where: { email: Raw((alias) => `lower(${alias}) = :email`, { email: newEmployee.email }) },
        });
        if (sameEmail) throw new ConflictException(`อีเมล ${newEmployee.email} เป็นของพนักงานในระบบอยู่แล้ว`);
      }
    } else if (dto.onBehalfOfEmployeeId != null && dto.onBehalfOfEmployeeId !== currentUser.employeeId) {
      if (!currentUser.permissions.includes('requisition.create_on_behalf')) {
        throw new ForbiddenException('พนักงานทั่วไปเบิก/ยืมได้เฉพาะให้ตัวเองเท่านั้น — การเบิกให้คนอื่นต้องทำโดย HR / IT admin');
      }
      const onBehalfOf = await this.employeeRepo.findOne({ where: { employeeId: dto.onBehalfOfEmployeeId } });
      if (!onBehalfOf) throw new NotFoundException(`ไม่พบพนักงาน id ${dto.onBehalfOfEmployeeId}`);
      requestedFor = onBehalfOf.employeeId;
    }

    for (const item of dto.items) {
      const hasAsset = item.assetId != null;
      const hasStock = item.stockItemId != null;
      if (hasAsset === hasStock) {
        throw new BadRequestException('แต่ละรายการต้องระบุ assetId หรือ stockItemId อย่างใดอย่างหนึ่งเท่านั้น');
      }
    }

    // ทรัพย์สินแบบมี assetId คือของชิ้นเดียวเจาะจง (serialized) — กันเลือกชิ้นเดียวกันซ้ำในคำขอเดียว
    // และกันกรณี stale form/แข่งกันเบิกพร้อมกัน: เช็คสถานะ ณ ตอนสร้างจริงอีกที ไม่พึ่งแค่ frontend filter
    // (การจ่ายจริงตอนอนุมัติครบก็ยัง lock ซ้ำอีกชั้นใน AssignmentsService.issue อยู่แล้ว นี่แค่ปฏิเสธไว
    // ตั้งแต่ตอนสร้างคำขอแทนที่จะปล่อยให้ไปพังเงียบๆ ตอนอนุมัติ)
    const requestedAssetIds = dto.items.map((i) => i.assetId).filter((id): id is number => id != null);
    if (new Set(requestedAssetIds).size !== requestedAssetIds.length) {
      throw new BadRequestException('มีทรัพย์สินชิ้นเดียวกันถูกเลือกซ้ำหลายรายการในคำขอเดียว');
    }
    if (requestedAssetIds.length > 0) {
      const requestedAssets = await this.assetRepo.find({
        where: { assetId: In(requestedAssetIds) },
        relations: { category: { parent: true } },
      });
      const canRequestHrOnly = currentUser.permissions.includes('requisition.create_on_behalf');
      for (const assetId of requestedAssetIds) {
        const asset = requestedAssets.find((a) => a.assetId === assetId);
        if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${assetId}`);
        // หมวดที่ตั้ง requiresHrRequest (เช่น notebook / tablet) ต้องให้ HR ทำรายการให้เท่านั้น — HR เองเบิกให้
        // ตัวเองหรือคนอื่นได้ตามปกติ; เช็คทั้งหมวดย่อยและหมวดหลัก ให้ตรงกับ requiresHrRequest() ฝั่ง frontend
        if (!canRequestHrOnly && (asset.category?.requiresHrRequest || asset.category?.parent?.requiresHrRequest)) {
          throw new ForbiddenException(
            `"${asset.assetName}" (หมวด ${asset.category.categoryName}) ต้องให้ HR เป็นผู้ทำรายการเบิก/ยืมให้ กรุณาติดต่อ HR`,
          );
        }
        if (asset.currentStatus !== AssetStatus.IN_STOCK) {
          throw new ConflictException(
            `ทรัพย์สิน "${asset.assetName}" (S/N: ${asset.serialNumber ?? '-'}) ถูกเบิก/ยืมไปแล้วโดยคนอื่นก่อนหน้านี้ กรุณาเลือกเครื่องอื่น`,
          );
        }
      }
    }

    // ผู้อนุมัติต้องเป็น it_admin — ถ้า it_admin เป็นผู้ขอ/ผู้รับเอง อนุมัติใบตัวเองไม่ได้ จึงอนุมัติอัตโนมัติแทน
    // การรอใคร (ไม่อ่าน dto.approverIds); พนักงานใหม่ยังไม่มี id และไม่มีทางเป็น it_admin อยู่แล้ว
    const itAdminIds = await this.findItAdminIds();
    const selfAdminId = [requestedBy, requestedFor].find((id): id is number => id != null && itAdminIds.includes(id));
    const approverIds = selfAdminId != null ? [selfAdminId] : (dto.approverIds ?? []);
    if (selfAdminId == null) {
      if (approverIds.length === 0) {
        throw new BadRequestException('กรุณาเลือกผู้อนุมัติอย่างน้อย 1 คน');
      }
      if (new Set(approverIds).size !== approverIds.length) {
        throw new BadRequestException('approverIds มีรายชื่อซ้ำกัน');
      }
      // ผู้ขอ/ผู้รับที่ไม่ใช่ it_admin ไม่มีทางผ่านเช็คนี้ จึงกันการอนุมัติใบของตัวเองไปในตัวด้วย
      if (approverIds.some((id) => !itAdminIds.includes(id))) {
        throw new BadRequestException('ผู้อนุมัติต้องเป็นผู้ดูแลระบบ IT (IT Admin) เท่านั้น');
      }
    }
    const autoApproved = selfAdminId != null;

    // โหลดข้อมูล employee ผู้รับทรัพย์สิน (พร้อม department) ไว้ default ค่าที่ผู้ใช้ไม่ได้กรอกมาให้ใบส่งมอบ-ส่งคืน
    // ทรัพย์สิน (ดู GET /requisitions/:id/document) — ผู้รับ = requestedFor ถ้าเบิกให้คนอื่น ไม่งั้นคือผู้ขอเอง
    // ต้อง query แยกเพราะด้านบนยังไม่ได้ join department มาด้วย; พนักงานใหม่ค่อยโหลดหลังสร้างใน transaction
    let recipientEmployee: Employee | null = null;
    if (!newEmployee) {
      const recipientId = requestedFor ?? requestedBy;
      recipientEmployee = await this.employeeRepo.findOne({
        where: { employeeId: recipientId },
        relations: ['department'],
      });
      if (!recipientEmployee) throw new NotFoundException(`ไม่พบพนักงาน id ${recipientId}`);
    }

    const created = await this.dataSource.transaction(async (manager) => {
      // สร้างพนักงานใหม่ใน transaction เดียวกับใบขอ — ใบขอสร้างไม่สำเร็จจะได้ไม่มีข้อมูลพนักงานค้างอยู่
      if (newEmployee) {
        const employee = await manager.save(
          manager.create(Employee, {
            employeeCode: newEmployee.employeeCode,
            fullName: newEmployee.fullName,
            departmentId: newEmployee.departmentId,
            position: newEmployee.position,
            email: newEmployee.email,
          }),
        );
        requestedFor = employee.employeeId;
        recipientEmployee = await manager.findOne(Employee, {
          where: { employeeId: employee.employeeId },
          relations: ['department'],
        });
      }
      const documentInfo = this.buildDocumentInfo(dto, recipientEmployee);

      const requisitionNo = await this.generateRequisitionNo(manager, dto.requestType);
      const requisition = manager.create(Requisition, {
        requisitionNo,
        requestedBy,
        requestedFor,
        requestType: dto.requestType,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        reason: dto.reason,
        documentInfo,
        overallStatus: autoApproved ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
      });
      await manager.save(requisition);

      const items = dto.items.map((i) =>
        manager.create(RequisitionItem, { ...i, requisitionId: requisition.requisitionId }),
      );
      await manager.save(items);

      const approvals = approverIds.map((approverId, idx) =>
        manager.create(RequisitionApproval, {
          requisitionId: requisition.requisitionId,
          approvalLevel: idx + 1,
          approverId,
          ...(autoApproved
            ? {
                status: ApprovalStatus.APPROVED,
                actionedAt: new Date(),
                comment: 'อนุมัติอัตโนมัติ — ผู้ดูแลระบบ IT เป็นผู้ขอ/ผู้รับเอง',
              }
            : { status: ApprovalStatus.PENDING }),
        }),
      );
      await manager.save(approvals);

      const found = await manager.findOne(Requisition, {
        where: { requisitionId: requisition.requisitionId },
        relations: ['requestedByEmployee', 'requestedForEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
      });
      if (!found) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${requisition.requisitionId}`);
      return found;
    });

    // แจ้งเตือนต้องอยู่นอก transaction เสมอ — ใช้ connection คนละตัวจาก manager (ผ่าน this.repo ปกติ)
    // และอาจ await ส่งอีเมล ถ้าอยู่ในนี้จะกัน connection ของ transaction ค้างไว้โดยไม่จำเป็น
    if (selfAdminId != null) {
      await this.onFullyApproved(created, selfAdminId);
      return this.getByIdOrThrow(created.requisitionId);
    }
    await this.notifications.notify(
      approverIds[0],
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

  // "ของฉัน" = ใบที่ฉันเป็นผู้ขอ หรือเป็นผู้รับทรัพย์สิน (HR เบิกให้ / พนักงานใหม่ที่ผูกบัญชีทีหลัง)
  findMine(employeeId: number, query: QueryRequisitionDto) {
    return this.queryWithFilters(query, employeeId);
  }

  /**
   * แบ่งเป็น 2 รอบ: รอบแรกกรอง/นับ/แบ่งหน้าบน requisition ล้วนๆ (ไม่ join items/approvals เข้ามาใน
   * query นี้) เพราะ items/approvals เป็น one-to-many — ถ้า leftJoinAndSelect เข้ามาตรงนี้ตั้งแต่แรก
   * แถวจะถูกคูณจาก join ทำให้ skip/take และ total นับผิดเพี้ยน (deep-pagination bug แบบคลาสสิกของ TypeORM)
   * รอบสองค่อยดึง relations แบบเต็มเฉพาะ id ที่ได้จากหน้านี้เท่านั้น
   */
  private async queryWithFilters(query: QueryRequisitionDto, mineEmployeeId?: number) {
    const qb = this.repo.createQueryBuilder('r');

    if (mineEmployeeId != null) {
      qb.andWhere('(r.requestedBy = :me OR r.requestedFor = :me)', { me: mineEmployeeId });
    }
    if (query.search) {
      // join แค่นี้ (ไม่ leftJoinAndSelect) เพราะรอบนี้ใช้แค่กรอง/นับ ไม่ได้ดึงข้อมูล employee มาด้วย
      qb.leftJoin('r.requestedByEmployee', 'requester');
      qb.leftJoin('r.requestedForEmployee', 'recipient');
      qb.andWhere(
        '(r.requisitionNo ILIKE :s OR r.reason ILIKE :s OR requester.fullName ILIKE :s OR recipient.fullName ILIKE :s)',
        { s: `%${query.search}%` },
      );
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
      relations: ['requestedByEmployee', 'requestedForEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
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
      relations: ['requestedByEmployee', 'requestedForEmployee', 'items', 'items.asset', 'approvals', 'approvals.approver'],
    });
    if (!r) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${id}`);
    return r;
  }

  /**
   * `requisition.view_own` ตั้งใจให้ดูได้เฉพาะใบของตัวเอง — ต้องเช็ค ownership เทียบกับ
   * requestedBy จริง ไม่ใช่แค่มี permission code นี้แล้วดูใบของใครก็ได้ตาม id
   *
   * ผู้อนุมัติที่ถูกระบุใน approverIds (ทุกลำดับชั้น ไม่ใช่แค่ระดับที่ pending อยู่) ต้องดูได้ด้วย แม้ไม่มี
   * requisition.view_all — ไม่งั้นถ้ามี role ที่ให้แค่ requisition.approve (เช่น หัวหน้างาน/manager ที่ไม่ใช่
   * it_admin) ผู้อนุมัติจะกดลิงก์จาก notification "มีใบขอรออนุมัติ" แล้วเจอ 403 ทันที เข้าไปอนุมัติไม่ได้เลย
   */
  async findOne(id: number, currentUser: { employeeId: number | null; permissions: string[] }) {
    const r = await this.getByIdOrThrow(id);
    const canViewAll = currentUser.permissions.includes('requisition.view_all');
    const isApprover = r.approvals?.some((a) => a.approverId === currentUser.employeeId) ?? false;
    const isOwner = r.requestedBy === currentUser.employeeId || r.requestedFor === currentUser.employeeId;
    if (!canViewAll && !isApprover && !isOwner) {
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

  /**
   * เรนเดอร์ "ใบส่งมอบ-ส่งคืนทรัพย์สินของบริษัท" เป็น HTML จาก documentInfo ที่ snapshot ไว้ตอน create()
   * — ใช้ relations เต็ม (รวม department/company และ items.stockItem) ต่างจาก getByIdOrThrow ที่ใช้แค่
   * ปกติในหน้า list/detail ทั่วไป จึง query แยกอีกครั้งหลังผ่าน findOne() (เช็คสิทธิ์การเข้าถึงแล้ว)
   */
  async renderDocument(id: number, currentUser: { employeeId: number | null; permissions: string[] }) {
    await this.findOne(id, currentUser);
    const r = await this.repo.findOne({
      where: { requisitionId: id },
      relations: RequisitionsService.RELATIONS,
    });
    if (!r) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${id}`);
    return renderRequisitionDocumentHtml(r);
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
      await this.onFullyApproved(result, approverId);
    }

    return this.getByIdOrThrow(id);
  }

  /** employee_id ของผู้ดูแลระบบ IT (role it_admin) ทั้งหมด — คนเดียวที่เป็นผู้อนุมัติใบขอเบิก/ยืมได้ (ดู create()) */
  private async findItAdminIds(): Promise<number[]> {
    const admins = await this.employeeRepo
      .createQueryBuilder('e')
      .innerJoin('e.employeeRoles', 'er')
      .innerJoin('er.role', 'r')
      .where('r.roleName = :roleName', { roleName: 'it_admin' })
      .orderBy('e.employeeId', 'ASC')
      .getMany();
    return admins.map((a) => a.employeeId);
  }

  /**
   * หลังใบขออนุมัติครบ (ทั้งกดอนุมัติใน approve() และอนุมัติอัตโนมัติตอน create()) — จ่ายทรัพย์สินให้ผู้รับ
   * แล้วแจ้งผู้รับด้วยถ้า HR เบิกให้คนอื่น (ผู้ขอได้แจ้งเตือนแยกไปแล้ว หรือเป็นคนทำรายการเองอยู่แล้ว)
   */
  private async onFullyApproved(requisition: Requisition, issuedBy: number) {
    await this.autoIssueApprovedItems(requisition, issuedBy);
    if (requisition.requestedFor != null && requisition.requestedFor !== requisition.requestedBy) {
      await this.notifications.notify(
        requisition.requestedFor,
        NotificationType.REQUISITION_APPROVED,
        'มีทรัพย์สินเบิก/ยืมให้คุณ',
        `ใบขอ ${requisition.requisitionNo} ได้รับการอนุมัติครบแล้ว ทรัพย์สินจะถูกส่งมอบให้คุณ`,
        'requisition',
        requisition.requisitionId,
      );
    }
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
            holderId: requisition.requestedFor ?? requisition.requestedBy,
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
