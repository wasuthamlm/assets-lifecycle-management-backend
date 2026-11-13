import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { SupportTicket, TicketReporterInfo } from './entities/support-ticket.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Asset } from '../assets/entities/asset.entity';
import { Location } from '../locations/entities/location.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { EscalateToRepairDto } from './dto/escalate-to-repair.dto';
import { HolderType, NotificationType, TicketPriority, TicketSource, TicketStatus } from '@common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { RepairsService } from '../repairs/repairs.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { LineMessage, staffNewTicketMessage, ticketStatusMessage } from '../line/line-flex';
import { LineMessagingService } from '../line/line-messaging.service';
import { generateSequentialNumber } from '@common/utils/sequential-number.util';
import { toThaiDateString } from '@common/utils/thai-date.util';

type CurrentUserScope = { employeeId: number | null; permissions: string[] };

/**
 * resolved → in_progress = เปิดงานใหม่ (ผู้แจ้งบอกว่ายังไม่หาย) — closed/cancelled เป็นสถานะจบแล้ว แก้ต่อไม่ได้
 */
const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CANCELLED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.RESOLVED, TicketStatus.CANCELLED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  [TicketStatus.CLOSED]: [],
  [TicketStatus.CANCELLED]: [],
};

// ข้อความแจ้งเตือนถึงผู้แจ้ง — ภาษาเดียวกับ label ฝั่ง frontend
const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'รอดำเนินการ',
  [TicketStatus.IN_PROGRESS]: 'กำลังดำเนินการ',
  [TicketStatus.RESOLVED]: 'แก้ไขแล้ว',
  [TicketStatus.CLOSED]: 'ปิดงาน',
  [TicketStatus.CANCELLED]: 'ยกเลิก',
};

@Injectable()
export class SupportTicketsService {
  private readonly logger = new Logger(SupportTicketsService.name);
  private static readonly RELATIONS = ['asset', 'assignment', 'assignedToEmployee', 'repair', 'location'];

  constructor(
    @InjectRepository(SupportTicket) private repo: Repository<SupportTicket>,
    private repairsService: RepairsService,
    private notifications: NotificationsService,
    private attachments: AttachmentsService,
    private dataSource: DataSource,
    // @Optional — test เดิมสร้าง service โดยไม่ส่งตัวนี้ และไม่มี LINE ก็ต้องทำงานได้ตามปกติ
    @Optional() private lineMessaging?: LineMessagingService,
  ) {}

  /**
   * source ไม่ได้มาจาก DTO — client ปลอมเป็น LINE ไม่ได้ เฉพาะ LineLiffController (ที่ผ่านการตรวจ LINE ID token แล้ว)
   * เท่านั้นที่ส่ง TicketSource.LINE เข้ามา
   */
  async create(
    dto: CreateTicketDto,
    currentUser: CurrentUserScope & { employeeId: number },
    opts: { source?: TicketSource; notifyReporter?: boolean } = {},
  ) {
    const reportedBy = currentUser.employeeId;
    const source = opts.source ?? TicketSource.WEB;
    const ticket = await this.dataSource.transaction(async (manager) => {
      const employee = await manager.findOne(Employee, {
        where: { employeeId: reportedBy },
        relations: ['department', 'department.parent'],
      });
      if (!employee) throw new NotFoundException(`ไม่พบข้อมูลพนักงาน id ${reportedBy}`);

      const reporterInfo: TicketReporterInfo = {
        fullName: employee.fullName,
        departmentName: employee.department?.departmentName ?? null,
        divisionName: employee.department?.parent?.departmentName ?? null,
        phone: dto.contactPhone?.trim() || employee.phone || null,
      };

      // ผูกกับการเบิก/ยืมที่ผู้แจ้งถืออยู่จริง — กันพนักงานเดา assetId แล้วเปิด ticket ใส่ทรัพย์สินของคนอื่น
      // it_admin (ticket.manage) เปิดแทนได้ทุกชิ้น เช่น ของในสต๊อก/ของส่วนกลาง
      let assignmentId: number | null = null;
      if (dto.assetId) {
        const assignment = await manager.findOne(Assignment, {
          where: { assetId: dto.assetId, holderType: HolderType.EMPLOYEE, holderId: reportedBy, returnedDate: IsNull() },
        });
        if (assignment) {
          assignmentId = assignment.assignmentId;
        } else if (currentUser.permissions.includes('ticket.manage')) {
          const asset = await manager.findOne(Asset, { where: { assetId: dto.assetId } });
          if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);
        } else {
          throw new ForbiddenException('แจ้งปัญหาได้เฉพาะทรัพย์สินที่คุณถือหรือยืมอยู่เท่านั้น');
        }
      }

      if (dto.locationId) {
        const location = await manager.findOne(Location, { where: { locationId: dto.locationId } });
        if (!location) throw new NotFoundException(`ไม่พบสถานที่ id ${dto.locationId}`);
      }

      const prefix = `IT-${toThaiDateString(new Date()).slice(2, 7).replace('-', '')}-`;
      const ticketNo = await generateSequentialNumber(manager, SupportTicket, 'ticketNo', prefix);

      const ticket = manager.create(SupportTicket, {
        ticketNo,
        source,
        reportedBy,
        reporterInfo,
        category: dto.category,
        subject: dto.subject.trim(),
        description: dto.description ?? null,
        priority: dto.priority ?? TicketPriority.NORMAL,
        assetId: dto.assetId ?? null,
        assetText: dto.assetId ? null : dto.assetText?.trim() || null,
        assignmentId,
        locationId: dto.locationId ?? null,
        locationDetail: dto.locationDetail.trim(),
        status: TicketStatus.OPEN,
        // ตั้งจาก Node ให้เหมือน resolvedAt/closedAt — ถ้าปล่อย DEFAULT now() ของ DB (session เป็น UTC) เวลาที่แสดงจะเพี้ยนเมื่อ Node ไม่ได้รันเป็น UTC
        createdAt: new Date(),
      });
      return manager.save(ticket);
    });

    // นอก transaction เสมอ — แจ้งทุกคนที่จัดการ ticket ได้ ยกเว้นคนที่แจ้งเอง
    await this.notifications.notifyByPermission(
      'ticket.manage',
      NotificationType.TICKET_CREATED,
      `${source === TicketSource.LINE ? '[LINE] ' : ''}มี ticket แจ้งปัญหาใหม่ ${ticket.ticketNo}`,
      `${ticket.reporterInfo.fullName}${ticket.reporterInfo.departmentName ? ` (${ticket.reporterInfo.departmentName})` : ''} แจ้ง: ${ticket.subject} — สถานที่: ${ticket.locationDetail}`,
      'support_ticket',
      ticket.ticketId,
      { exclude: [reportedBy] },
    );
    this.publishTicketChange(ticket, 'created');
    if (source === TicketSource.LINE) void this.pushNewTicketToStaff(ticket);
    // แชทบอทตอบกลับเองด้วย reply API (ฟรี ไม่กินโควตา push) จึงปิดตรงนี้ได้ด้วย notifyReporter: false
    if (opts.notifyReporter !== false) {
      this.pushToReporterIfLine(
        ticket,
        `✅ รับเรื่องแล้ว เลขที่ ${ticket.ticketNo}
เรื่อง: ${ticket.subject}
สถานที่: ${ticket.locationDetail}

ทีม IT จะแจ้งกลับทาง LINE นี้เมื่อสถานะเปลี่ยน`,
      );
    }

    return ticket;
  }

  /** หน้าจัดการ ticket (ticket.view_all — it_admin + hr) */
  findAll(query: QueryTicketDto) {
    return this.paginate(query);
  }

  /** หน้า "ประวัติการแจ้งของฉัน" — กรองด้วย reportedBy เสมอ ไม่ว่าผู้เรียกจะมี view_all หรือไม่ */
  findMine(employeeId: number, query: QueryTicketDto) {
    return this.paginate(query, employeeId);
  }

  /**
   * ทุก relation ที่ join เป็น ManyToOne จึง leftJoinAndSelect + skip/take ในคิวรีเดียวได้ (ไม่เสี่ยง row-multiplication)
   * ค้นชื่อผู้แจ้งจาก snapshot reporterInfo ไม่ใช่ employees — ให้ตรงกับที่แสดงในหน้า ticket
   */
  private paginate(query: QueryTicketDto, reportedBy?: number) {
    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.asset', 'asset')
      .leftJoinAndSelect('t.assignedToEmployee', 'assignee')
      .leftJoinAndSelect('t.location', 'location');

    if (reportedBy !== undefined) qb.andWhere('t.reportedBy = :reportedBy', { reportedBy });
    if (query.search) {
      qb.andWhere(
        "(t.ticketNo ILIKE :s OR t.subject ILIKE :s OR t.reporterInfo->>'fullName' ILIKE :s OR asset.assetNo ILIKE :s OR t.assetText ILIKE :s OR t.locationDetail ILIKE :s)",
        { s: `%${query.search}%` },
      );
    }
    if (query.status?.length) qb.andWhere('t.status IN (:...statuses)', { statuses: query.status });
    if (query.category) qb.andWhere('t.category = :category', { category: query.category });
    if (query.source) qb.andWhere('t.source = :source', { source: query.source });

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.orderBy('t.ticketId', 'DESC').skip((page - 1) * limit).take(limit);

    return qb.getManyAndCount().then(([data, total]) => ({ data, total, page, limit }));
  }

  /** ticket.view_own ดูได้เฉพาะของตัวเอง — ของคนอื่นต้องมี ticket.view_all (hr / it_admin) */
  async findOne(id: number, currentUser: CurrentUserScope) {
    const t = await this.repo.findOne({ where: { ticketId: id }, relations: SupportTicketsService.RELATIONS });
    if (!t) throw new NotFoundException(`ไม่พบ ticket id ${id}`);
    const canViewAll = currentUser.permissions.includes('ticket.view_all');
    if (!canViewAll && t.reportedBy !== currentUser.employeeId) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์ดู ticket นี้');
    }
    return t;
  }

  async updateStatus(id: number, dto: UpdateTicketStatusDto, updatedBy: number) {
    let statusChanged = false;
    const ticket = await this.dataSource.transaction(async (manager) => {
      const ticket = await manager.findOne(SupportTicket, { where: { ticketId: id }, lock: { mode: 'pessimistic_write' } });
      if (!ticket) throw new NotFoundException(`ไม่พบ ticket id ${id}`);
      statusChanged = dto.status !== ticket.status;

      if (statusChanged) {
        const allowed = TICKET_STATUS_TRANSITIONS[ticket.status] || [];
        if (!allowed.includes(dto.status)) {
          throw new BadRequestException(`ไม่สามารถเปลี่ยนสถานะ ticket จาก '${ticket.status}' เป็น '${dto.status}' ได้`);
        }
      }

      if (dto.assignedTo !== undefined) {
        const assignee = await manager.findOne(Employee, { where: { employeeId: dto.assignedTo } });
        if (!assignee) throw new NotFoundException(`ไม่พบพนักงาน id ${dto.assignedTo}`);
        ticket.assignedTo = dto.assignedTo;
      } else if (dto.status === TicketStatus.IN_PROGRESS && !ticket.assignedTo) {
        // กด "รับงาน" โดยไม่ระบุผู้รับ = คนที่กดเป็นคนรับเอง
        ticket.assignedTo = updatedBy;
      }

      ticket.status = dto.status;
      if (dto.priority) ticket.priority = dto.priority;
      if (dto.resolution) ticket.resolution = dto.resolution;

      if (statusChanged) {
        if (dto.status === TicketStatus.RESOLVED) ticket.resolvedAt = new Date();
        if (dto.status === TicketStatus.CLOSED || dto.status === TicketStatus.CANCELLED) ticket.closedAt = new Date();
        // เปิดงานใหม่ → ล้างเวลาที่แก้ไขเสร็จเดิมทิ้ง ไม่งั้นรายงานเวลาแก้ไขจะเพี้ยน
        if (dto.status === TicketStatus.IN_PROGRESS) ticket.resolvedAt = null;
      }

      return manager.save(ticket);
    });

    // แจ้งผู้แจ้งเฉพาะตอนสถานะเปลี่ยนจริง และไม่แจ้งถ้าเป็นคนอัปเดตเอง
    if (statusChanged && ticket.reportedBy !== updatedBy) {
      await this.notifyStatusChanged(ticket);
    }
    this.publishTicketChange(ticket, 'updated');

    return ticket;
  }

  /**
   * IT ตรวจแล้วพบว่าอุปกรณ์เสียจริง → สร้างงานซ่อมผ่าน RepairsService (asset เป็น under_repair + movement log)
   * แล้วผูก repairId กลับมาใน transaction เดียวกัน — ปิดงานซ่อมเมื่อไหร่ ticket จะเป็น resolved อัตโนมัติ
   * (ดู RepairsService.updateStatus)
   */
  async escalateToRepair(id: number, dto: EscalateToRepairDto, escalatedBy: number) {
    const { ticket, repair, asset } = await this.dataSource.transaction(async (manager) => {
      const ticket = await manager.findOne(SupportTicket, { where: { ticketId: id }, lock: { mode: 'pessimistic_write' } });
      if (!ticket) throw new NotFoundException(`ไม่พบ ticket id ${id}`);
      if (!ticket.assetId) throw new BadRequestException('ticket นี้ไม่ได้ระบุทรัพย์สิน จึงส่งซ่อมไม่ได้');
      if (ticket.repairId) throw new BadRequestException('ticket นี้ส่งซ่อมไปแล้ว');
      if (![TicketStatus.OPEN, TicketStatus.IN_PROGRESS].includes(ticket.status)) {
        throw new BadRequestException(`ไม่สามารถส่งซ่อม ticket ที่มีสถานะ '${ticket.status}' ได้`);
      }

      const problemDescription =
        dto.problemDescription?.trim() ||
        `[${ticket.ticketNo}] ${ticket.subject}${ticket.description ? ` — ${ticket.description}` : ''}`;
      const { repair, asset } = await this.repairsService.createInTransaction(
        manager,
        { assetId: ticket.assetId, problemDescription, vendorId: dto.vendorId },
        escalatedBy,
      );

      ticket.repairId = repair.repairId;
      ticket.status = TicketStatus.IN_PROGRESS;
      ticket.assignedTo ??= escalatedBy;
      await manager.save(ticket);

      return { ticket, repair, asset };
    });

    await this.repairsService.notifyRepairReported(repair, asset, escalatedBy);
    this.publishTicketChange(ticket, 'updated');
    if (ticket.reportedBy !== escalatedBy) {
      await this.notifications.notify(
        ticket.reportedBy,
        NotificationType.TICKET_STATUS_UPDATED,
        `Ticket ${ticket.ticketNo}: ส่งซ่อม`,
        `ทรัพย์สิน ${asset.assetNo} ที่คุณแจ้งปัญหา ถูกส่งซ่อมแล้ว`,
        'support_ticket',
        ticket.ticketId,
      );
      this.pushToReporterIfLine(ticket, `🔧 ${ticket.ticketNo}: ทรัพย์สิน ${asset.assetNo} ที่คุณแจ้งปัญหา ถูกส่งซ่อมแล้ว`);
    }

    return { ...ticket, repair };
  }

  async listAttachments(id: number, currentUser: CurrentUserScope) {
    await this.findOne(id, currentUser);
    return this.attachments.findByReference('support_ticket', id);
  }

  async uploadAttachment(id: number, file: Express.Multer.File, currentUser: CurrentUserScope, uploadedBy: number) {
    const t = await this.assertCanModifyAttachments(id, currentUser);
    const saved = await this.attachments.saveUpload(file, { referenceType: 'support_ticket', referenceId: id }, uploadedBy);
    this.publishTicketChange(t, 'updated');
    return saved;
  }

  async removeAttachment(id: number, attachmentId: number, currentUser: CurrentUserScope) {
    const t = await this.assertCanModifyAttachments(id, currentUser);
    // ต้องเช็คว่า attachmentId นี้เป็นของ ticket id นี้จริง ไม่งั้นเจ้าของ ticket A เดา id แล้วลบไฟล์แนบของ ticket B ได้
    const ownAttachments = await this.attachments.findByReference('support_ticket', id);
    if (!ownAttachments.some((a) => a.attachmentId === attachmentId)) {
      throw new NotFoundException(`ไม่พบไฟล์แนบ id ${attachmentId} ใน ticket นี้`);
    }
    const result = await this.attachments.remove(attachmentId);
    this.publishTicketChange(t, 'updated');
    return result;
  }

  /** hr มี view_all แต่ต้องอ่านอย่างเดียว — แนบ/ลบไฟล์ได้เฉพาะเจ้าของ ticket หรือ ticket.manage */
  private async assertCanModifyAttachments(id: number, currentUser: CurrentUserScope) {
    const t = await this.findOne(id, currentUser);
    if (t.reportedBy !== currentUser.employeeId && !currentUser.permissions.includes('ticket.manage')) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์แก้ไขไฟล์แนบของ ticket นี้');
    }
    return t;
  }

  /** หน้าจอ ticket ของ it_admin/hr (view_all) และของผู้แจ้งเองอัปเดตสด */
  private publishTicketChange(ticket: SupportTicket, action: 'created' | 'updated') {
    this.notifications.publishChange({
      topic: 'support_ticket',
      action,
      id: ticket.ticketId,
      audience: { permission: 'ticket.view_all', employeeIds: [ticket.reportedBy] },
    });
  }

  /**
   * แจ้งผู้แจ้งทาง LINE ด้วย เฉพาะ ticket ที่แจ้งมาจาก LINE (ประหยัดโควตา push ของ OA — คนแจ้งทางเว็บก็ดูในเว็บ)
   * ไม่ await — LineMessagingService ไม่ throw อยู่แล้ว และไม่ควรให้ response ของ IT ช้าตาม LINE API
   */
  private pushToReporterIfLine(ticket: SupportTicket, content: string | LineMessage[]) {
    if (ticket.source !== TicketSource.LINE || !this.lineMessaging) return;
    void this.lineMessaging.pushToEmployee(ticket.reportedBy, content);
  }

  /**
   * งานที่แจ้งมาจาก LINE → เด้งการ์ด "รับงาน" เข้า LINE ของเจ้าหน้าที่ทุกคนที่มี ticket.manage และผูก LINE แล้ว
   * (กดรับงานจัดการที่ LineStaffService) — เฉพาะ ticket จาก LINE เพื่อประหยัดโควตา push; ห้าม throw
   */
  private async pushNewTicketToStaff(ticket: SupportTicket) {
    if (!this.lineMessaging) return;
    try {
      const staffIds = (await this.notifications.findEmployeeIdsByPermission('ticket.manage')).filter((id) => id !== ticket.reportedBy);
      await this.lineMessaging.pushToEmployees(staffIds, [staffNewTicketMessage(ticket, this.lineMessaging.webUrl)]);
    } catch (err) {
      this.logger.warn(`ส่งงาน ${ticket.ticketNo} เข้า LINE เจ้าหน้าที่ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  private async notifyStatusChanged(ticket: SupportTicket) {
    const label = TICKET_STATUS_LABEL[ticket.status];
    const resolutionText = ticket.resolution && ticket.status !== TicketStatus.IN_PROGRESS ? ` — ${ticket.resolution}` : '';
    this.pushToReporterIfLine(ticket, [ticketStatusMessage(ticket, this.lineMessaging?.webUrl)]);
    await this.notifications.notify(
      ticket.reportedBy,
      NotificationType.TICKET_STATUS_UPDATED,
      `Ticket ${ticket.ticketNo}: ${label}`,
      `เรื่อง "${ticket.subject}" ที่คุณแจ้ง เปลี่ยนสถานะเป็น "${label}"${resolutionText}`,
      'support_ticket',
      ticket.ticketId,
    );
  }
}
