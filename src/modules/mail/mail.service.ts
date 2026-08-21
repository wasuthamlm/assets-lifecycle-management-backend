import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * ถ้าไม่ตั้งค่า SMTP_HOST ไว้ จะไม่ส่งอีเมลจริง แค่ log แทน — ทำให้ dev/deploy ที่ยังไม่มี
 * SMTP credential ใช้งานฟีเจอร์แจ้งเตือนได้ทันที (in-app) โดยอีเมลจะเริ่มส่งจริงเองทันทีที่ใส่ค่า
 * ครบใน env โดยไม่ต้องแก้โค้ด
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT') || 587,
        auth: this.config.get<string>('SMTP_USER')
          ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') }
          : undefined,
      });
    }
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(`[mail:noop] to=${to} subject="${subject}" — SMTP_HOST ยังไม่ได้ตั้งค่า`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM') || 'noreply@millimedthailand.com',
        to,
        subject,
        text,
      });
    } catch (err) {
      // อีเมลส่งไม่ได้ต้องไม่ทำให้ request หลัก (เช่น สร้าง/อนุมัติใบขอ) ล้มเหลวตาม
      this.logger.warn(`ส่งอีเมลไม่สำเร็จ: ${(err as Error).message}`);
    }
  }
}
