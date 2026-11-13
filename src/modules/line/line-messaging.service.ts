import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { LineMessage, textMessage } from './line-flex';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_MULTICAST_URL = 'https://api.line.me/v2/bot/message/multicast';
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_CONTENT_URL = 'https://api-data.line.me/v2/bot/message';
const LINE_MARK_AS_READ_URL = 'https://api.line.me/v2/bot/chat/markAsRead';
const LINE_LOADING_URL = 'https://api.line.me/v2/bot/chat/loading/start';

/**
 * ส่งข้อความหาพนักงานทาง LINE OA (Messaging API push) — best-effort เสมอ:
 * ไม่ตั้ง token / พนักงานยังไม่ผูก LINE / LINE ล่ม → log แล้วจบ ห้าม throw ทำให้งานหลัก (อัปเดต ticket) พัง
 * push นับโควตาข้อความรายเดือนของ OA จึงเรียกเฉพาะ ticket ที่แจ้งมาจาก LINE (ดู SupportTicketsService)
 */
@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  constructor(
    private config: ConfigService,
    @InjectRepository(Employee) private employees: Repository<Employee>,
  ) {}

  /** URL ของเว็บ (Vercel) ไว้ใส่ปุ่ม "ดูบนเว็บ" ในการ์ด — ไม่ใช่ http(s) จะไม่แสดงปุ่ม */
  get webUrl(): string | undefined {
    return this.config.get<string>('FRONTEND_URL');
  }

  /** content = ข้อความธรรมดา หรือ message object (Flex ฯลฯ) สูงสุด 5 อัน */
  async pushToEmployee(employeeId: number, content: string | LineMessage[]): Promise<void> {
    const token = this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN')?.trim();
    if (!token) return;

    try {
      const employee = await this.employees.findOne({ where: { employeeId }, select: ['employeeId', 'lineUserId'] });
      if (!employee?.lineUserId) return;

      const res = await fetch(LINE_PUSH_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: employee.lineUserId, messages: typeof content === 'string' ? [textMessage(content)] : content.slice(0, 5) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`LINE push ถึง employee ${employeeId} ไม่สำเร็จ (${res.status}): ${await res.text()}`);
      }
    } catch (err) {
      this.logger.warn(`LINE push ถึง employee ${employeeId} ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  /**
   * ส่งหาพนักงานหลายคนพร้อมกัน (multicast) — คนที่ยังไม่ผูก LINE ข้ามไป
   * นับโควตาต่อผู้รับ 1 คน = 1 ข้อความ เหมือน push; best-effort ห้าม throw
   */
  async pushToEmployees(employeeIds: number[], messages: LineMessage[]): Promise<void> {
    const token = this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN')?.trim();
    if (!token || !employeeIds.length || !messages.length) return;
    try {
      const rows = await this.employees.find({
        where: { employeeId: In([...new Set(employeeIds)]), lineUserId: Not(IsNull()) },
        select: ['employeeId', 'lineUserId'],
      });
      const to = rows.map((e) => e.lineUserId!).filter(Boolean);
      if (!to.length) return;
      const res = await fetch(LINE_MULTICAST_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.slice(0, 500), messages: messages.slice(0, 5) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) this.logger.warn(`LINE multicast ไม่สำเร็จ (${res.status}): ${await res.text()}`);
    } catch (err) {
      this.logger.warn(`LINE multicast ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  /**
   * ตอบข้อความในแชทด้วย replyToken จาก webhook — ฟรี ไม่นับโควตา (ต่างจาก push) แต่ token ใช้ได้ครั้งเดียวภายใน ~1 นาที
   * best-effort เหมือน push: ห้าม throw
   */
  async reply(replyToken: string, texts: string[]): Promise<void> {
    return this.replyMessages(replyToken, texts.map((t) => textMessage(t)));
  }

  /** เหมือน reply แต่ส่ง message object ได้ (Flex / quick reply) — reply ส่งได้ไม่เกิน 5 ข้อความต่อครั้ง */
  async replyMessages(replyToken: string, messages: LineMessage[]): Promise<void> {
    const token = this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN')?.trim();
    if (!token || !messages.length) return;
    try {
      const res = await fetch(LINE_REPLY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) this.logger.warn(`LINE reply ไม่สำเร็จ (${res.status}): ${await res.text()}`);
    } catch (err) {
      this.logger.warn(`LINE reply ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  /**
   * ขึ้น "อ่านแล้ว" ให้ข้อความของผู้ใช้ — จำเป็นเมื่อ OA เปิดโหมด Chat (markAsReadMode = manual)
   * ไม่งั้นข้อความค้างเป็นยังไม่อ่านจนกว่าแอดมินจะเปิดดูใน OA Manager; best-effort ห้าม throw
   */
  async markAsRead(markAsReadToken: string): Promise<void> {
    await this.postQuietly(LINE_MARK_AS_READ_URL, { markAsReadToken }, 'markAsRead');
  }

  /** จุดไข่ปลา "กำลังพิมพ์..." ระหว่างบอททำงาน (เช่นเปิด ticket) — หายเองเมื่อบอทตอบ */
  async showLoading(lineUserId: string, seconds = 10): Promise<void> {
    await this.postQuietly(LINE_LOADING_URL, { chatId: lineUserId, loadingSeconds: seconds }, 'loading');
  }

  private async postQuietly(url: string, body: object, label: string): Promise<void> {
    const token = this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN')?.trim();
    if (!token) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) this.logger.warn(`LINE ${label} ไม่สำเร็จ (${res.status}): ${await res.text()}`);
    } catch (err) {
      this.logger.warn(`LINE ${label} ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  /** ดาวน์โหลดไฟล์ (รูป) ที่ผู้ใช้ส่งมาในแชท — LINE เก็บไว้ชั่วคราว ต้องดึงมาเก็บเองหลังได้ webhook */
  async getMessageContent(messageId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const token = this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN')?.trim();
    if (!token) throw new Error('ไม่ได้ตั้ง LINE_MESSAGING_ACCESS_TOKEN');
    const res = await fetch(`${LINE_CONTENT_URL}/${encodeURIComponent(messageId)}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ดึงไฟล์จาก LINE ไม่สำเร็จ (${res.status})`);
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim(),
    };
  }
}
