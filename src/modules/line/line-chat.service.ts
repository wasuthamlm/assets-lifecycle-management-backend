import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { extname } from 'path';
import { AssignmentType, TicketCategory, TicketSource, TicketStatus } from '@common/enums';
import { User } from '../users/entities/user.entity';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { SupportTicketsService } from '../support-tickets/support-tickets.service';
import { SupportTicket } from '../support-tickets/entities/support-ticket.entity';
import { RequisitionsService } from '../requisitions/requisitions.service';
import { Requisition } from '../requisitions/entities/requisition.entity';
import { AssignmentsService } from '../assignments/assignments.service';
import { ALLOWED_ATTACHMENT_MIME_TYPES, maxAttachmentSizeBytes } from '../attachments/attachment-upload.config';
import { LineMessagingService } from './line-messaging.service';
import { LineLinkService } from './line-link.service';
import { resolveLineUser } from './line-id-token.guard';
import { LineBorrowService, bangkokToday } from './line-borrow.service';
import { LineStaffService } from './line-staff.service';
import {
  LineMessage,
  TICKET_CATEGORY_LABEL,
  helpMessage,
  myAssetsMessage,
  notLinkedMessage,
  statusOverviewMessage,
  textMessage,
  ticketCreatedMessage,
  ticketPromptMessage,
} from './line-flex';

/** event จาก webhook เฉพาะส่วนที่ใช้ — https://developers.line.biz/en/reference/messaging-api/#webhook-event-objects */
export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: {
    id: string;
    type: string;
    text?: string;
    markAsReadToken?: string;
    imageSet?: { id: string; index: number; total: number };
  };
  /** กดปุ่มใน rich menu / Flex — params.date มาจากปุ่มเลือกวันที่ (datetimepicker) */
  postback?: { data: string; params?: { date?: string } };
}

/** รูปที่ส่งตามมาหลังพิมพ์อาการภายในเวลานี้ จะถูกแนบเข้า ticket ล่าสุดที่แจ้งทางแชท */
export const ATTACH_WINDOW_MS = 15 * 60 * 1000;
const SUBJECT_MAX = 80;
const NO_LOCATION = 'ไม่ได้ระบุ (แจ้งผ่านแชท LINE)';
// ข้อความทักทาย/ตอบรับที่ไม่ควรกลายเป็น ticket
const SMALL_TALK = new Set(['สวัสดี', 'สวัสดีครับ', 'สวัสดีค่ะ', 'ขอบคุณ', 'ขอบคุณครับ', 'ขอบคุณค่ะ', 'โอเค', 'ok', 'hi', 'hello', 'ครับ', 'ค่ะ', 'คะ', 'จ้า']);

type MenuKey = 'ticket' | 'borrow' | 'status' | 'assets' | 'help';
// คำที่พิมพ์แทนการกดเมนูได้ (เผื่อเครื่องที่ไม่เห็น rich menu เช่น LINE บน PC)
const TEXT_COMMANDS: Record<string, MenuKey> = {
  ช่วยเหลือ: 'help',
  help: 'help',
  วิธีใช้: 'help',
  เมนู: 'help',
  menu: 'help',
  สถานะ: 'status',
  เรื่องของฉัน: 'status',
  ติดตาม: 'status',
  ติดตามสถานะ: 'status',
  status: 'status',
  แจ้งปัญหา: 'ticket',
  'แจ้งปัญหา it': 'ticket',
  แจ้งซ่อม: 'ticket',
  เบิก: 'borrow',
  ยืม: 'borrow',
  เบิกยืม: 'borrow',
  'เบิก/ยืม': 'borrow',
  'เบิก/ยืมอุปกรณ์': 'borrow',
  อุปกรณ์ของฉัน: 'assets',
  ของที่ยืม: 'assets',
};
const BORROW_ACTIONS = new Set(['bc', 'ba', 'bt', 'bp', 'bs', 'bx']);
// ปุ่มของเจ้าหน้าที่ IT ในการ์ดงานที่ถูก push มา (ดู LineStaffService)
const STAFF_ACTIONS = new Set(['sa', 'sr', 'ra']);

/**
 * แชทบอทฝ่าย IT: rich menu (สร้างด้วย scripts/line-rich-menu.mjs) → postback → ตอบเป็น Flex
 * - แจ้งปัญหา: พิมพ์อาการ 1 ข้อความ → เปิด ticket (หมวด "อื่นๆ" แล้วให้เลือกประเภทจาก quick reply ได้)
 * - เบิก/ยืม: ดู LineBorrowService
 * - เจ้าหน้าที่ IT: งานใหม่/ใบขอถูก push เข้า LINE พร้อมปุ่มรับงาน/อนุมัติ — ดู LineStaffService
 * ทุกการตอบใช้ reply API (ฟรี) — push ใช้เฉพาะตอนสถานะ ticket เปลี่ยน (ดู SupportTicketsService)
 * ห้าม throw ออกไป: webhook ตอบ 200 ให้ LINE ไปแล้ว error ตรงนี้ไม่มีใครรับ
 */
@Injectable()
export class LineChatService {
  private readonly logger = new Logger(LineChatService.name);

  constructor(
    private messaging: LineMessagingService,
    private linkService: LineLinkService,
    private tickets: SupportTicketsService,
    private jwtStrategy: JwtStrategy,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(SupportTicket) private ticketRepo: Repository<SupportTicket>,
    private borrow: LineBorrowService,
    private requisitions: RequisitionsService,
    private assignments: AssignmentsService,
    private staff: LineStaffService,
  ) {}

  async handleEvents(events: LineWebhookEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.handleEvent(event);
      } catch (err) {
        this.logger.error(`จัดการ LINE event (${event.type}) ไม่สำเร็จ: ${(err as Error).message}`, (err as Error).stack);
        if (event.replyToken) await this.messaging.reply(event.replyToken, ['ขออภัย ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง']);
      }
    }
  }

  private get webUrl() {
    return this.messaging.webUrl;
  }

  private async handleEvent(event: LineWebhookEvent): Promise<void> {
    const lineUserId = event.source?.userId;
    const replyToken = event.replyToken;
    // แชทกลุ่ม/ห้อง ไม่รองรับ — ต้องคุย 1:1 กับ OA เพื่อรู้ว่าใครแจ้ง
    if (!lineUserId || !replyToken || event.source?.type !== 'user') return;
    // ขึ้น "อ่านแล้ว" ทันที — ถ้า OA เปิดโหมด Chat ข้อความจะไม่ถูกอ่านอัตโนมัติ
    if (event.message?.markAsReadToken) void this.messaging.markAsRead(event.message.markAsReadToken);
    const send = (...messages: LineMessage[]) => this.messaging.replyMessages(replyToken, messages);

    const user = await this.resolveUser(lineUserId);

    if (event.type === 'follow') {
      return send(user ? helpMessage(user.fullName, this.webUrl) : notLinkedMessage(this.webUrl));
    }

    if (!user) {
      if (event.type === 'postback') return send(notLinkedMessage(this.webUrl));
      if (event.type !== 'message' || !event.message) return;
      const text = event.message.type === 'text' ? (event.message.text ?? '').trim() : '';
      if (!/^\d{6}$/.test(text)) return send(notLinkedMessage(this.webUrl));
      const result = await this.linkService.linkByCode(lineUserId, text);
      if (result === 'too_many_attempts') return send(textMessage('ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วขอรหัสใหม่'));
      if (result === 'invalid') return send(textMessage('รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากหน้าโปรไฟล์ในเว็บ'));
      const linked = await this.resolveUser(lineUserId);
      return send(textMessage('✅ เชื่อมบัญชีเรียบร้อย'), helpMessage(linked?.fullName ?? null, this.webUrl));
    }

    if (user.mustChangePassword) return send(textMessage('กรุณาเข้าเว็บเพื่อเปลี่ยนรหัสผ่านก่อน จึงจะใช้งานผ่าน LINE ได้'));

    if (event.type === 'postback' && event.postback) {
      return send(...(await this.handlePostback(user, lineUserId, event.postback)));
    }
    if (event.type !== 'message' || !event.message) return;

    const { message } = event;
    if (message.type === 'text') return send(...(await this.handleText(user, lineUserId, (message.text ?? '').trim())));
    if (message.type === 'image') return this.handleImage(user, message, (...t) => this.messaging.reply(replyToken, t));
    return send(textMessage('ตอนนี้รองรับเฉพาะข้อความและรูปภาพครับ', true));
  }

  private async handlePostback(
    user: ChatUser,
    lineUserId: string,
    postback: NonNullable<LineWebhookEvent['postback']>,
  ): Promise<LineMessage[]> {
    const params = new URLSearchParams(postback.data);
    if (postback.params?.date) params.set('date', postback.params.date);
    const action = params.get('a') ?? '';

    if (action === 'menu') return this.menu(user, params.get('m') as MenuKey);
    if (action === 'tc') return [await this.setTicketCategory(user, Number(params.get('id')), params.get('c'))];
    if (action === 'noop') return [textMessage('ยกเลิกแล้วครับ')];
    if (STAFF_ACTIONS.has(action)) {
      void this.messaging.showLoading(lineUserId, 5);
      return this.staff.handle(user, params, this.webUrl);
    }
    if (BORROW_ACTIONS.has(action)) {
      void this.messaging.showLoading(lineUserId, 5);
      return this.borrow.handle(user, params, this.webUrl);
    }
    return [helpMessage(user.fullName, this.webUrl)];
  }

  private async menu(user: ChatUser, key: MenuKey): Promise<LineMessage[]> {
    switch (key) {
      case 'ticket':
        return [ticketPromptMessage()];
      case 'borrow':
        return this.borrow.handle(user, new URLSearchParams({ a: 'menu' }), this.webUrl);
      case 'status':
        return [await this.statusOverview(user)];
      case 'assets':
        return [await this.myAssets(user)];
      default:
        return [helpMessage(user.fullName, this.webUrl)];
    }
  }

  private async handleText(user: ChatUser, lineUserId: string, text: string): Promise<LineMessage[]> {
    const normalized = text.toLowerCase();
    const command = TEXT_COMMANDS[normalized];
    if (command) return this.menu(user, command);
    if (/^\d{6}$/.test(text)) return [textMessage('บัญชีนี้เชื่อมกับพนักงานเรียบร้อยแล้ว พิมพ์อาการที่พบมาได้เลย', true)];
    if (text.length < 5 || SMALL_TALK.has(normalized)) return [helpMessage(user.fullName, this.webUrl)];

    if (!user.permissions.includes('ticket.create')) return [textMessage('บัญชีของคุณไม่มีสิทธิ์แจ้งปัญหา กรุณาติดต่อฝ่าย IT')];

    void this.messaging.showLoading(lineUserId, 10);
    const firstLine = text.split('\n')[0].trim();
    const subject = firstLine.length > SUBJECT_MAX ? `${firstLine.slice(0, SUBJECT_MAX - 1)}…` : firstLine;
    const ticket = await this.tickets.create(
      { category: TicketCategory.OTHER, subject, description: text, locationDetail: NO_LOCATION },
      { employeeId: user.employeeId, permissions: user.permissions },
      { source: TicketSource.LINE, notifyReporter: false },
    );
    return [ticketCreatedMessage(ticket, this.webUrl)];
  }

  /**
   * ผู้แจ้งเลือกประเภทจาก quick reply หลังเปิด ticket — data มาจาก client จึงอัปเดตเฉพาะ ticket ของตัวเอง
   * ที่แจ้งทาง LINE และยังรอดำเนินการอยู่ (IT รับเรื่อง/จัดหมวดแล้วจะไม่ไปทับ)
   */
  private async setTicketCategory(user: ChatUser, ticketId: number, category: string | null): Promise<LineMessage> {
    const valid = (Object.values(TicketCategory) as string[]).includes(category ?? '') && category !== TicketCategory.OTHER;
    if (!Number.isInteger(ticketId) || ticketId <= 0 || !valid) return textMessage('ข้อมูลไม่ถูกต้อง', true);
    const result = await this.ticketRepo.update(
      { ticketId, reportedBy: user.employeeId, source: TicketSource.LINE, status: TicketStatus.OPEN },
      { category: category as TicketCategory },
    );
    if (!result.affected) return textMessage('เปลี่ยนประเภทไม่ได้แล้ว (IT อาจรับเรื่องไปแล้ว)', true);
    return textMessage(`👍 บันทึกประเภท "${TICKET_CATEGORY_LABEL[category as TicketCategory]}" แล้ว`, true);
  }

  private async statusOverview(user: ChatUser): Promise<LineMessage> {
    const canSeeRequisitions = user.permissions.includes('requisition.create') || user.permissions.includes('requisition.view_own');
    const [tickets, requisitions] = await Promise.all([
      this.tickets.findMine(user.employeeId, { page: 1, limit: 5 }),
      canSeeRequisitions
        ? this.requisitions.findMine(user.employeeId, { page: 1, limit: 5 })
        : Promise.resolve({ data: [] as Requisition[] }),
    ]);
    return statusOverviewMessage(
      tickets.data,
      requisitions.data.map((r) => ({
        requisitionId: r.requisitionId,
        requisitionNo: r.requisitionNo,
        requestType: r.requestType,
        overallStatus: r.overallStatus,
        dueDate: r.dueDate,
        assetNames: (r.items ?? []).map((i) => i.asset?.assetName).filter((n): n is string => !!n),
      })),
      this.webUrl,
    );
  }

  private async myAssets(user: ChatUser): Promise<LineMessage> {
    const rows = await this.assignments.findMine(user.employeeId);
    return myAssetsMessage(
      rows.map((a) => ({
        assetName: a.asset?.assetName ?? '-',
        assetNo: a.asset?.assetNo ?? '-',
        serialNumber: a.asset?.serialNumber,
        categoryName: a.asset?.category?.categoryName,
        isLoan: a.assignmentType === AssignmentType.TEMPORARY_LOAN,
        dueDate: a.dueDate,
        issuedDate: a.issuedDate,
      })),
      bangkokToday(),
    );
  }

  private async handleImage(
    user: ChatUser,
    message: NonNullable<LineWebhookEvent['message']>,
    reply: (...t: string[]) => Promise<void>,
  ) {
    const ticket = await this.ticketRepo.findOne({
      where: {
        reportedBy: user.employeeId,
        source: TicketSource.LINE,
        createdAt: MoreThan(new Date(Date.now() - ATTACH_WINDOW_MS)),
      },
      order: { ticketId: 'DESC' },
    });
    if (!ticket) return reply('กรุณาพิมพ์อาการที่พบก่อน แล้วค่อยส่งรูปตามมาครับ');

    const { buffer, contentType } = await this.messaging.getMessageContent(message.id);
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(contentType)) return reply('รองรับเฉพาะรูป jpg, png หรือ webp');
    if (buffer.length > maxAttachmentSizeBytes()) return reply('รูปมีขนาดใหญ่เกินไป');

    const ext = extname(`x.${contentType.split('/')[1]}`).replace('.jpeg', '.jpg');
    const file = {
      buffer,
      mimetype: contentType,
      size: buffer.length,
      originalname: `line-${message.id}${ext}`,
    } as Express.Multer.File;
    await this.tickets.uploadAttachment(ticket.ticketId, file, user, user.employeeId);

    // ส่งหลายรูปพร้อมกัน (imageSet) จะได้ event ทีละรูป — ตอบครั้งเดียวที่รูปสุดท้าย ไม่ให้แชทรก
    const set = message.imageSet;
    if (!set || set.index === set.total) {
      return reply(`📎 แนบรูป${set ? ` ${set.total} รูป` : ''}เข้าเรื่อง ${ticket.ticketNo} แล้ว`);
    }
  }

  /** null = ยังไม่ผูก หรือบัญชีถูกระงับ/ไม่มีข้อมูลพนักงาน (ถือว่าใช้แชทไม่ได้เหมือนกัน) */
  private async resolveUser(lineUserId: string): Promise<ChatUser | null> {
    try {
      const payload = await resolveLineUser(this.users, this.jwtStrategy, lineUserId);
      if (!payload?.employeeId) return null;
      const user = await this.users.findOne({
        where: { userId: payload.userId },
        relations: ['employee'],
        select: { userId: true, employee: { employeeId: true, fullName: true } },
      });
      return { ...payload, employeeId: payload.employeeId, fullName: user?.employee?.fullName ?? payload.username };
    } catch {
      return null;
    }
  }
}

type ChatUser = Awaited<ReturnType<JwtStrategy['validate']>> & { employeeId: number; fullName: string };
