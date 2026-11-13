import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketCategory, TicketSource } from '@common/enums';
import { SupportTicketsService } from '../support-tickets/support-tickets.service';
import { LineChatSession } from './entities/line-chat-session.entity';
import {
  LineMessage,
  TicketDraftView,
  textMessage,
  ticketConfirmMessage,
  ticketCreatedMessage,
  ticketStepCategoryMessage,
  ticketStepLocationMessage,
  ticketStepSymptomMessage,
} from './line-flex';

export const TICKET_FLOW_TTL_MS = 30 * 60 * 1000;
const FLOW = 'ticket';
const SUBJECT_MAX = 80;
const SYMPTOM_MIN = 3;
const SYMPTOM_MAX = 2000;
const LOCATION_MAX = 200;
const NO_LOCATION = 'ไม่ได้ระบุ (แจ้งผ่านแชท LINE)';

type Step = 'category' | 'symptom' | 'location' | 'confirm';

export interface TicketFlowUser {
  employeeId: number;
  permissions: string[];
}

/**
 * แจ้งปัญหาทาง LINE แบบทีละขั้น — เริ่มได้จากเมนู "แจ้งปัญหา" เท่านั้น
 *   1 ประเภท (ปุ่ม) → 2 อาการ (พิมพ์) → 3 สถานที่ (พิมพ์/ข้าม) → 4 ยืนยัน (ปุ่ม "ส่งแจ้ง IT")
 * ข้อความที่พิมพ์ตอนไม่ได้อยู่ในขั้นตอน handleText() คืน null → LineChatService ไม่ตอบ/ไม่กดอ่าน
 * ปล่อยเป็นแชทปกติให้แอดมิน OA เห็นเป็นข้อความยังไม่อ่าน (กันพิมพ์เล่น/เผลอส่งแล้วกลายเป็นงาน)
 */
@Injectable()
export class LineTicketFlowService {
  constructor(
    @InjectRepository(LineChatSession) private sessions: Repository<LineChatSession>,
    private tickets: SupportTicketsService,
  ) {}

  async start(user: TicketFlowUser, lineUserId: string): Promise<LineMessage[]> {
    if (!user.permissions.includes('ticket.create')) return [textMessage('บัญชีของคุณไม่มีสิทธิ์แจ้งปัญหา กรุณาติดต่อฝ่าย IT', true)];
    await this.save(lineUserId, 'category', {});
    return [ticketStepCategoryMessage()];
  }

  /** อยู่ในขั้นตอนที่รอพิมพ์ไหม — ใช้ตัดสินว่าข้อความนี้เป็นของบอทหรือเป็นแชทปกติ */
  async isActive(lineUserId: string): Promise<boolean> {
    return !!(await this.active(lineUserId));
  }

  /** null = ไม่ได้อยู่ในขั้นตอน → ปล่อยเป็นแชทปกติ */
  async handleText(lineUserId: string, text: string): Promise<LineMessage[] | null> {
    const session = await this.active(lineUserId);
    if (!session) return null;
    const draft = session.data as TicketDraftView;

    if (session.step === 'symptom') {
      if (text.length < SYMPTOM_MIN) return [textMessage('ช่วยพิมพ์อาการให้ละเอียดขึ้นอีกนิดครับ'), ticketStepSymptomMessage(draft)];
      if (text.length > SYMPTOM_MAX) return [textMessage(`อาการยาวเกินไป (ไม่เกิน ${SYMPTOM_MAX} ตัวอักษร)`), ticketStepSymptomMessage(draft)];
      const next = { ...draft, symptom: text };
      await this.save(lineUserId, 'location', next);
      return [ticketStepLocationMessage(next)];
    }
    if (session.step === 'location') {
      if (text.length > LOCATION_MAX) return [textMessage(`สถานที่ยาวเกินไป (ไม่เกิน ${LOCATION_MAX} ตัวอักษร)`), ticketStepLocationMessage(draft)];
      const next = { ...draft, location: text };
      await this.save(lineUserId, 'confirm', next);
      return [ticketConfirmMessage(next)];
    }
    // ขั้นที่ต้องกดปุ่ม (ประเภท/ยืนยัน) แต่พิมพ์มา — ชี้กลับไปที่ปุ่ม
    return [textMessage('ขั้นนี้ให้กดปุ่มในการ์ดครับ (หรือกด "ยกเลิกการแจ้ง")'), this.stepCard(session.step as Step, draft)];
  }

  async handlePostback(user: TicketFlowUser, lineUserId: string, params: URLSearchParams, webUrl?: string): Promise<LineMessage[]> {
    const s = params.get('s');
    if (s === 'x') {
      await this.sessions.delete({ lineUserId });
      return [textMessage('ยกเลิกการแจ้งปัญหาแล้ว', true)];
    }
    if (s === 'new') return this.start(user, lineUserId);

    const session = await this.active(lineUserId);
    if (!session) return [textMessage('หมดเวลาหรือส่งไปแล้ว กดเมนู "แจ้งปัญหา" เพื่อเริ่มใหม่', true)];
    const step = session.step as Step;
    const draft = session.data as TicketDraftView;

    if (s === 'c' && step === 'category') {
      const category = params.get('c') as TicketCategory;
      if (!(Object.values(TicketCategory) as string[]).includes(category)) return [this.stepCard(step, draft)];
      const next = { category };
      await this.save(lineUserId, 'symptom', next);
      return [ticketStepSymptomMessage(next)];
    }
    if (s === 'skip' && step === 'location') {
      const next = { ...draft, location: null };
      await this.save(lineUserId, 'confirm', next);
      return [ticketConfirmMessage(next)];
    }
    if (s === 'ok' && step === 'confirm') return this.submit(user, lineUserId, webUrl);

    // ปุ่มจากการ์ดเก่า (กดย้อนขั้น/กดซ้ำ) — แสดงขั้นปัจจุบันแทน
    return [this.stepCard(step, draft)];
  }

  /** ลบ session แล้วได้แถวคืน = ส่งได้ครั้งเดียว แม้กด "ส่งแจ้ง IT" รัวๆ */
  private async submit(user: TicketFlowUser, lineUserId: string, webUrl?: string): Promise<LineMessage[]> {
    if (!user.permissions.includes('ticket.create')) return [textMessage('บัญชีของคุณไม่มีสิทธิ์แจ้งปัญหา กรุณาติดต่อฝ่าย IT', true)];
    const rows: { data: TicketDraftView }[] = await this.consumeConfirmedQuery(lineUserId, new Date())
      .execute()
      .then((r) => r.raw ?? []);
    const draft = rows[0]?.data;
    if (!draft?.symptom || !draft.category) return [textMessage('ส่งไปแล้ว หรือหมดเวลา กดเมนู "แจ้งปัญหา" เพื่อเริ่มใหม่', true)];

    const firstLine = draft.symptom.split('\n')[0].trim();
    const subject = firstLine.length > SUBJECT_MAX ? `${firstLine.slice(0, SUBJECT_MAX - 1)}…` : firstLine;
    const ticket = await this.tickets.create(
      { category: draft.category, subject, description: draft.symptom, locationDetail: draft.location || NO_LOCATION },
      { employeeId: user.employeeId, permissions: user.permissions },
      { source: TicketSource.LINE, notifyReporter: false },
    );
    return [ticketCreatedMessage(ticket, webUrl)];
  }

  /** returning ต้องเป็น string — array แล้ว TypeORM ทิ้ง RETURNING เงียบๆ (ดู LineLinkService.consumeCodeQuery) */
  consumeConfirmedQuery(lineUserId: string, now: Date) {
    return this.sessions
      .createQueryBuilder()
      .delete()
      .where('line_user_id = :lineUserId AND flow = :flow AND step = :step AND expires_at > :now', { lineUserId, flow: FLOW, step: 'confirm', now })
      .returning('data');
  }

  private stepCard(step: Step, draft: TicketDraftView): LineMessage {
    if (step === 'symptom') return ticketStepSymptomMessage(draft);
    if (step === 'location') return ticketStepLocationMessage(draft);
    if (step === 'confirm') return ticketConfirmMessage(draft);
    return ticketStepCategoryMessage();
  }

  private async active(lineUserId: string): Promise<LineChatSession | null> {
    const session = await this.sessions.findOne({ where: { lineUserId } });
    if (!session || session.flow !== FLOW || session.expiresAt.getTime() <= Date.now()) return null;
    return session;
  }

  private save(lineUserId: string, step: Step, data: TicketDraftView) {
    return this.sessions.save({ lineUserId, flow: FLOW, step, data: data as Record<string, unknown>, expiresAt: new Date(Date.now() + TICKET_FLOW_TTL_MS) });
  }
}
