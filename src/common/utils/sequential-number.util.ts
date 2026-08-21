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
 *
 * หาค่าล่าสุดด้วยการดึงทุกแถวที่ตรง prefix มาเทียบเป็นตัวเลขใน JS แทนการ ORDER BY เป็น string —
 * ถ้า padLength=1 (ไม่ใส่ศูนย์นำหน้า) การ ORDER BY string DESC จะผิด เช่น '...-9' > '...-10' ทำให้เลขซ้ำ/ชน unique constraint
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
  const rows = await manager
    .createQueryBuilder(entity, alias)
    .select(`${alias}.${column}`, 'value')
    .where(`${alias}.${column} LIKE :prefix`, { prefix: `${prefix}%` })
    .getRawMany<{ value: string }>();

  const maxSeq = rows.reduce((max, row) => {
    const n = parseInt(row.value.replace(prefix, ''), 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);

  return `${prefix}${String(maxSeq + 1).padStart(padLength, '0')}`;
}
