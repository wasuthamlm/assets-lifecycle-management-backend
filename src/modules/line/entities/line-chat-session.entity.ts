import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * ขั้นตอนที่ผู้ใช้กำลังทำอยู่ในแชท LINE (ตอนนี้มีแค่ flow 'ticket' = แจ้งปัญหาทีละขั้น)
 * ต้องอยู่ใน DB: ข้อความที่พิมพ์ (อาการ/สถานที่) ยาวเกินจะยัดใน postback data (จำกัด 300 ตัวอักษร)
 * และ Render หลับ/deploy ใหม่ได้ระหว่างขั้น — 1 แถวต่อ 1 บัญชี LINE, หมดอายุเองตาม expiresAt
 */
@Entity('line_chat_sessions')
export class LineChatSession {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  lineUserId: string;

  @Column({ type: 'varchar', length: 20 })
  flow: string;

  @Column({ type: 'varchar', length: 20 })
  step: string;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  data: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
