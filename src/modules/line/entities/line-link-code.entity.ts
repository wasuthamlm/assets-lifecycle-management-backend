import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * รหัส 6 หลักสำหรับผูก LINE กับพนักงาน (หน้าโปรไฟล์ขอรหัส → พิมพ์ในแชท OA)
 * เก็บใน DB ไม่ใช่หน่วยความจำ — หน้าเว็บกับ webhook อาจวิ่งคนละ process (Render หลับ/deploy ใหม่,
 * หรือ webhook ชี้มาเครื่อง dev ผ่าน tunnel) ถ้าเก็บใน Map รหัสจะ "ไม่ถูกต้อง" ทั้งที่ยังไม่หมดอายุ
 */
@Entity('line_link_codes')
export class LineLinkCode {
  @PrimaryColumn({ type: 'varchar', length: 6 })
  code: string;

  /** 1 คนมีรหัสที่ใช้ได้ทีละอัน — ขอใหม่จะลบอันเดิม */
  @Index('UQ_line_link_codes_employee_id', { unique: true })
  @Column({ type: 'int' })
  employeeId: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}

/** นับการพิมพ์รหัสผิดต่อบัญชี LINE กัน brute-force รหัส 6 หลัก */
@Entity('line_link_attempts')
export class LineLinkAttempt {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  lineUserId: string;

  @Column({ type: 'int', default: 0 })
  failedCount: number;

  @Column({ type: 'timestamptz' })
  resetAt: Date;
}
