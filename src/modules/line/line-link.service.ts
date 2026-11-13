import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { randomInt } from 'crypto';
import { LineAuthService } from './line-auth.service';

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

/** ผูก/ยกเลิกผูกบัญชี LINE กับพนักงาน — 1 LINE ต่อ 1 พนักงาน (unique ที่ employees.line_user_id) */
@Injectable()
export class LineLinkService {
  constructor(
    private lineAuth: LineAuthService,
    @InjectRepository(Employee) private employees: Repository<Employee>,
  ) {}

  async status(employeeId: number) {
    const e = await this.employees.findOne({ where: { employeeId }, select: ['employeeId', 'lineUserId'] });
    return { linked: !!e?.lineUserId };
  }

  /**
   * ผูกซ้ำด้วย LINE อื่นได้ (เปลี่ยนเครื่อง/บัญชี LINE) — ทับค่าเดิม
   * แต่ถ้า LINE นี้ผูกกับพนักงานคนอื่นอยู่ → 409 ต้องให้คนเดิมยกเลิกก่อน (หรือ admin ล้างให้)
   * ชนกันพร้อมกันสองคำขอ unique constraint จะกันไว้ แล้ว HttpExceptionFilter แปลงเป็น 409 ให้
   */
  async link(employeeId: number, idToken: string) {
    const lineUserId = await this.lineAuth.verifyIdToken(idToken);
    const taken = await this.employees.findOne({ where: { lineUserId, employeeId: Not(employeeId) }, select: ['employeeId'] });
    if (taken) throw new ConflictException('บัญชี LINE นี้ผูกกับพนักงานคนอื่นอยู่แล้ว');

    await this.employees.update({ employeeId }, { lineUserId });
    return { linked: true };
  }

  async unlink(employeeId: number) {
    await this.employees.update({ employeeId }, { lineUserId: null });
    return { linked: false };
  }

  /**
   * ผูกผ่านแชทบอท: หน้าโปรไฟล์ขอรหัส 6 หลัก → พนักงานพิมพ์รหัสในแชท OA → linkByCode()
   * เก็บในหน่วยความจำ (backend รัน instance เดียว) — restart แล้วรหัสหาย แค่ขอใหม่ อายุสั้นอยู่แล้ว
   */
  private readonly codes = new Map<string, { employeeId: number; expiresAt: number }>();
  private readonly failedAttempts = new Map<string, { count: number; resetAt: number }>();

  createLinkCode(employeeId: number, now = Date.now()) {
    // รหัสเดิมของคนนี้ใช้ไม่ได้แล้ว — มีรหัสที่ใช้ได้ทีละอันต่อคน
    for (const [code, v] of this.codes) {
      if (v.employeeId === employeeId || v.expiresAt <= now) this.codes.delete(code);
    }
    let code: string;
    do {
      code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    } while (this.codes.has(code));
    const expiresAt = now + LINK_CODE_TTL_MS;
    this.codes.set(code, { employeeId, expiresAt });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * ผลลัพธ์เป็น union แทน throw — แชทบอทต้องแปลงเป็นข้อความตอบกลับอยู่ดี
   * จำกัดการเดาผิดต่อบัญชี LINE กัน brute-force รหัส 6 หลัก
   */
  async linkByCode(
    lineUserId: string,
    code: string,
    now = Date.now(),
  ): Promise<'linked' | 'invalid' | 'too_many_attempts'> {
    const attempts = this.failedAttempts.get(lineUserId);
    if (attempts && attempts.resetAt > now && attempts.count >= MAX_FAILED_ATTEMPTS) return 'too_many_attempts';

    const entry = this.codes.get(code);
    if (!entry || entry.expiresAt <= now) {
      const fresh = !attempts || attempts.resetAt <= now;
      this.failedAttempts.set(lineUserId, {
        count: fresh ? 1 : attempts.count + 1,
        resetAt: fresh ? now + LINK_CODE_TTL_MS : attempts.resetAt,
      });
      return 'invalid';
    }

    this.codes.delete(code);
    this.failedAttempts.delete(lineUserId);
    // LINE นี้ผูกกับคนอื่นอยู่ (ปกติแชทบอทไม่เรียกในกรณีนี้) → ย้ายมาคนใหม่ เพราะเจ้าของรหัสยืนยันตัวผ่านเว็บแล้ว
    await this.employees.update({ lineUserId, employeeId: Not(entry.employeeId) }, { lineUserId: null });
    await this.employees.update({ employeeId: entry.employeeId }, { lineUserId });
    return 'linked';
  }
}
