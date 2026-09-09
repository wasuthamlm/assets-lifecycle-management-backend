const THAI_TIMEZONE = 'Asia/Bangkok';

/**
 * แปลง Date เป็นวันที่ปฏิทิน (YYYY-MM-DD) ตามเวลาไทยเสมอ ไม่ว่า process/container จะตั้ง TZ เป็นอะไรก็ตาม
 * ใช้แทนการเทียบ Date object ตรงๆ ซึ่งอิง TZ ของเครื่องที่รัน — Postgres session ในระบบนี้ตั้งเป็น UTC
 * (ดู warranty-expiry.cron.ts) จึงต้อง anchor การเทียบ "วันที่" ทุกจุดเข้ากับเวลาไทยแบบ explicit เหมือนกันหมด
 */
export function toThaiDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: THAI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * true ถ้า `at` (ค่าเริ่มต้น = ตอนนี้) ผ่านพ้นวันที่ `dueDate` ไปแล้วตามปฏิทินไทย (date-only, ไม่สนเวลา)
 * ใช้จุดเดียวกันทั้งระบบ (cron ตรวจ overdue, AssignmentsService.return_() ตรวจคืนช้า) กันนิยาม "เกินกำหนด"
 * เพี้ยนกันไปมาระหว่างจุดต่างๆ
 */
export function isPastDueDateThai(dueDate: Date, at: Date = new Date()): boolean {
  return toThaiDateString(at) > toThaiDateString(dueDate);
}
