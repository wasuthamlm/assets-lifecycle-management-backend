import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_CONTENT_URL = 'https://api-data.line.me/v2/bot/message';
// LINE จำกัดข้อความ text ไว้ 5000 ตัวอักษร
const MAX_TEXT_LENGTH = 5000;

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

  async pushToEmployee(employeeId: number, text: string): Promise<void> {
    const token = this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN');
    if (!token) return;

    try {
      const employee = await this.employees.findOne({ where: { employeeId }, select: ['employeeId', 'lineUserId'] });
      if (!employee?.lineUserId) return;

      const res = await fetch(LINE_PUSH_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: employee.lineUserId, messages: [{ type: 'text', text: text.slice(0, MAX_TEXT_LENGTH) }] }),
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
   * ตอบข้อความในแชทด้วย replyToken จาก webhook — ฟรี ไม่นับโควตา (ต่างจาก push) แต่ token ใช้ได้ครั้งเดียวภายใน ~1 นาที
   * best-effort เหมือน push: ห้าม throw
   */
  async reply(replyToken: string, texts: string[]): Promise<void> {
    const token = this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN');
    if (!token || !texts.length) return;
    try {
      const res = await fetch(LINE_REPLY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replyToken,
          // reply ส่งได้ไม่เกิน 5 ข้อความต่อครั้ง
          messages: texts.slice(0, 5).map((text) => ({ type: 'text', text: text.slice(0, MAX_TEXT_LENGTH) })),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) this.logger.warn(`LINE reply ไม่สำเร็จ (${res.status}): ${await res.text()}`);
    } catch (err) {
      this.logger.warn(`LINE reply ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  /** ดาวน์โหลดไฟล์ (รูป) ที่ผู้ใช้ส่งมาในแชท — LINE เก็บไว้ชั่วคราว ต้องดึงมาเก็บเองหลังได้ webhook */
  async getMessageContent(messageId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const token = this.config.get<string>('LINE_MESSAGING_ACCESS_TOKEN');
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
