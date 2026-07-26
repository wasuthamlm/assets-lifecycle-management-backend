import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

/**
 * สร้างเลขที่เอกสารรูปแบบ `${prefix}${seq}` (เช่น PO-2026-0001) แบบปลอดภัยจาก race condition
 *
 * ปัญหาเดิม: อ่านเลขล่าสุดแล้ว +1 เอง (read-then-write) — 2 request ที่สร้างพร้อมกันอ่านเห็นเลขล่าสุดเดียวกัน
 * ได้เลขซ้ำ แล้วไปชน unique constraint ตอน insert (500 ดิบ)
 *
 * แก้ด้วย pg_advisory_xact_lock คีย์ตาม prefix — lock นี้ผูกกับ transaction ปัจจุบัน (ปล่อยอัตโนมัติตอน commit/rollback)
 * ทำให้ request ที่สร้างเลขในปีเดียวกัน/entity เดียวกันพร้อมกันถูก serialize เฉพาะช่วงอ่าน-คำนวณเลขนี้เท่านั้น
 * ไม่ต้องเพิ่มตาราง counter ใหม่ ไม่ต้อง migration
 */
export async function generateSequentialNumber(
  manager: EntityManager,
  entity: EntityTarget<ObjectLiteral>,
  column: string,
  prefix: string,
  padLength = 4,
): Promise<string> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);

  const alias = 'seq_entity';
  const latest = await manager
    .createQueryBuilder(entity, alias)
    .where(`${alias}.${column} LIKE :prefix`, { prefix: `${prefix}%` })
    .orderBy(`${alias}.${column}`, 'DESC')
    .getOne();

  const latestValue = latest ? (latest as any)[column] : null;
  const seq = latestValue ? parseInt(String(latestValue).replace(prefix, ''), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(padLength, '0')}`;
}
