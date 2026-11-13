import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { extname } from 'path';
import { TicketCategory, TicketSource, TicketStatus } from '@common/enums';
import { User } from '../users/entities/user.entity';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { SupportTicketsService } from '../support-tickets/support-tickets.service';
import { SupportTicket } from '../support-tickets/entities/support-ticket.entity';
import { ALLOWED_ATTACHMENT_MIME_TYPES, maxAttachmentSizeBytes } from '../attachments/attachment-upload.config';
import { LineMessagingService } from './line-messaging.service';
import { LineLinkService } from './line-link.service';
import { resolveLineUser } from './line-id-token.guard';

/** event จาก webhook เฉพาะส่วนที่ใช้ — https://developers.line.biz/en/reference/messaging-api/#webhook-event-objects */
export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string; imageSet?: { id: string; index: number; total: number } };
}

/** รูปที่ส่งตามมาหลังพิมพ์อาการภายในเวลานี้ จะถูกแนบเข้า ticket ล่าสุดที่แจ้งทางแชท */
export const ATTACH_WINDOW_MS = 15 * 60 * 1000;
const SUBJECT_MAX = 80;
const NO_LOCATION = 'ไม่ได้ระบุ (แจ้งผ่านแชท LINE)';
const STATUS_LABEL: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'รอดำเนินการ',
  [TicketStatus.IN_PROGRESS]: 'กำลังดำเนินการ',
  [TicketStatus.RESOLVED]: 'แก้ไขแล้ว',
  [TicketStatus.CLOSED]: 'ปิดงาน',
  [TicketStatus.CANCELLED]: 'ยกเลิก',
};
// ข้อความทักทาย/ตอบรับที่ไม่ควรกลายเป็น ticket
const SMALL_TALK = new Set(['สวัสดี', 'สวัสดีครับ', 'สวัสดีค่ะ', 'ขอบคุณ', 'ขอบคุณครับ', 'ขอบคุณค่ะ', 'โอเค', 'ok', 'hi', 'hello', 'ครับ', 'ค่ะ', 'คะ', 'จ้า']);
const HELP_COMMANDS = new Set(['ช่วยเหลือ', 'help', 'วิธีใช้', 'เมนู']);
const STATUS_COMMANDS = new Set(['สถานะ', 'เรื่องของฉัน', 'ติดตาม', 'status']);

const HELP_TEXT = `พิมพ์อาการที่พบมาได้เลย 1 ข้อความ = 1 เรื่อง
เช่น "โน้ตบุ๊กเปิดไม่ติด อยู่ชั้น 3 ห้องบัญชี"

📷 ส่งรูปตามมาได้ภายใน 15 นาที ระบบจะแนบให้เรื่องล่าสุด
📋 พิมพ์ "สถานะ" เพื่อดูเรื่องที่แจ้งไว้`;

const NOT_LINKED_TEXT = `ยังไม่ได้เชื่อมบัญชีพนักงาน
1. เข้าเว็บระบบทรัพย์สิน → เมนูโปรไฟล์ → "เชื่อมต่อ LINE"
2. กด "ขอรหัส" แล้วพิมพ์รหัส 6 หลักที่ได้ในแชทนี้`;

/**
 * แชทบอทแจ้งปัญหา IT: พิมพ์อาการ 1 ข้อความ → เปิด ticket (หมวด "อื่นๆ" ให้ IT จัดหมวดเอง) แล้วตอบเลขที่กลับ
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

  private async handleEvent(event: LineWebhookEvent): Promise<void> {
    const lineUserId = event.source?.userId;
    const replyToken = event.replyToken;
    // แชทกลุ่ม/ห้อง ไม่รองรับ — ต้องคุย 1:1 กับ OA เพื่อรู้ว่าใครแจ้ง
    if (!lineUserId || !replyToken || event.source?.type !== 'user') return;
    const reply = (...texts: string[]) => this.messaging.reply(replyToken, texts);

    const user = await this.resolveUser(lineUserId);

    if (event.type === 'follow') {
      return reply(user ? `ยินดีต้อนรับกลับมา คุณ${user.fullName}\n\n${HELP_TEXT}` : `สวัสดีครับ นี่คือช่องทางแจ้งปัญหา IT\n\n${NOT_LINKED_TEXT}`);
    }
    if (event.type !== 'message' || !event.message) return;

    const { message } = event;
    if (!user) {
      const text = message.type === 'text' ? (message.text ?? '').trim() : '';
      if (!/^\d{6}$/.test(text)) return reply(NOT_LINKED_TEXT);
      const result = await this.linkService.linkByCode(lineUserId, text);
      if (result === 'too_many_attempts') return reply('ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วขอรหัสใหม่');
      if (result === 'invalid') return reply('รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากหน้าโปรไฟล์ในเว็บ');
      const linked = await this.resolveUser(lineUserId);
      return reply(`✅ เชื่อมบัญชีเรียบร้อย${linked ? ` คุณ${linked.fullName}` : ''}\n\n${HELP_TEXT}`);
    }

    if (user.mustChangePassword) return reply('กรุณาเข้าเว็บเพื่อเปลี่ยนรหัสผ่านก่อน จึงจะแจ้งปัญหาผ่าน LINE ได้');

    if (message.type === 'text') return this.handleText(user, (message.text ?? '').trim(), reply);
    if (message.type === 'image') return this.handleImage(user, message, reply);
    return reply('ตอนนี้รองรับเฉพาะข้อความและรูปภาพครับ\n\n' + HELP_TEXT);
  }

  private async handleText(user: ChatUser, text: string, reply: (...t: string[]) => Promise<void>) {
    const normalized = text.toLowerCase();
    if (HELP_COMMANDS.has(normalized)) return reply(HELP_TEXT);
    if (STATUS_COMMANDS.has(normalized)) return reply(await this.statusText(user));
    if (/^\d{6}$/.test(text)) return reply('บัญชีนี้เชื่อมกับพนักงานเรียบร้อยแล้ว พิมพ์อาการที่พบมาได้เลย');
    if (text.length < 5 || SMALL_TALK.has(normalized)) return reply(HELP_TEXT);

    if (!user.permissions.includes('ticket.create')) return reply('บัญชีของคุณไม่มีสิทธิ์แจ้งปัญหา กรุณาติดต่อฝ่าย IT');

    const firstLine = text.split('\n')[0].trim();
    const subject = firstLine.length > SUBJECT_MAX ? `${firstLine.slice(0, SUBJECT_MAX - 1)}…` : firstLine;
    const ticket = await this.tickets.create(
      { category: TicketCategory.OTHER, subject, description: text, locationDetail: NO_LOCATION },
      { employeeId: user.employeeId, permissions: user.permissions },
      { source: TicketSource.LINE, notifyReporter: false },
    );
    return reply(
      `✅ รับเรื่องแล้ว เลขที่ ${ticket.ticketNo}\nเรื่อง: ${ticket.subject}\n\n📷 มีรูปประกอบ ส่งตามมาได้เลย (ภายใน 15 นาที)\nทีม IT จะแจ้งความคืบหน้าทางแชทนี้`,
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

  private async statusText(user: ChatUser): Promise<string> {
    const { data } = await this.tickets.findMine(user.employeeId, { page: 1, limit: 5 });
    if (!data.length) return 'คุณยังไม่มีเรื่องที่แจ้งไว้';
    const lines = data.map((t) => `• ${t.ticketNo} — ${STATUS_LABEL[t.status]}\n  ${t.subject}`);
    return `เรื่องล่าสุดของคุณ\n\n${lines.join('\n\n')}`;
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
