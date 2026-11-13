import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Not, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { randomInt } from 'crypto';
import { LineAuthService } from './line-auth.service';
import { LineLinkAttempt, LineLinkCode } from './entities/line-link-code.entity';

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

/** ผูก/ยกเลิกผูกบัญชี LINE กับพนักงาน — 1 LINE ต่อ 1 พนักงาน (unique ที่ employees.line_user_id) */
@Injectable()
export class LineLinkService {
  constructor(
    private lineAuth: LineAuthService,
    @InjectRepository(Employee) private employees: Repository<Employee>,
    @InjectRepository(LineLinkCode) private codes: Repository<LineLinkCode>,
    @InjectRepository(LineLinkAttempt) private attempts: Repository<LineLinkAttempt>,
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
   * เก็บใน DB (line_link_codes) — ห้ามกลับไปใช้หน่วยความจำ: เว็บกับ webhook อาจเป็นคนละ process
   */
  async createLinkCode(employeeId: number, now = Date.now()) {
    // รหัสเดิมของคนนี้ใช้ไม่ได้แล้ว — มีรหัสที่ใช้ได้ทีละอันต่อคน; ถือโอกาสล้างรหัสหมดอายุของทุกคน
    await this.codes.delete({ employeeId });
    await this.codes.delete({ expiresAt: LessThanOrEqual(new Date(now)) });
    const expiresAt = new Date(now + LINK_CODE_TTL_MS);
    // ชนรหัสของคนอื่น (โอกาสน้อยมาก) → PK ซ้ำ ลองสุ่มใหม่
    for (let i = 0; i < 5; i++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      try {
        await this.codes.insert({ code, employeeId, expiresAt });
        return { code, expiresAt: expiresAt.toISOString() };
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
      }
    }
    throw new ServiceUnavailableException('สร้างรหัสไม่สำเร็จ กรุณาลองใหม่');
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
    const nowDate = new Date(now);
    const attempts = await this.attempts.findOne({ where: { lineUserId } });
    const attemptsActive = !!attempts && attempts.resetAt.getTime() > now;
    if (attemptsActive && attempts.failedCount >= MAX_FAILED_ATTEMPTS) return 'too_many_attempts';

    // ลบแล้วได้แถวคืนมา = ใช้รหัสได้ครั้งเดียวแม้กดส่งพร้อมกันสองครั้ง
    const consumed: { employee_id: number }[] = await this.codes
      .createQueryBuilder()
      .delete()
      .where('code = :code AND expires_at > :now', { code, now: nowDate })
      .returning(['employee_id'])
      .execute()
      .then((r) => r.raw ?? []);

    if (!consumed.length) {
      await this.attempts.save({
        lineUserId,
        failedCount: attemptsActive ? attempts.failedCount + 1 : 1,
        resetAt: attemptsActive ? attempts.resetAt : new Date(now + LINK_CODE_TTL_MS),
      });
      return 'invalid';
    }

    const employeeId = consumed[0].employee_id;
    await this.attempts.delete({ lineUserId });
    // LINE นี้ผูกกับคนอื่นอยู่ (ปกติแชทบอทไม่เรียกในกรณีนี้) → ย้ายมาคนใหม่ เพราะเจ้าของรหัสยืนยันตัวผ่านเว็บแล้ว
    await this.employees.update({ lineUserId, employeeId: Not(employeeId) }, { lineUserId: null });
    await this.employees.update({ employeeId }, { lineUserId });
    return 'linked';
  }
}
