import { randomInt } from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // ตัด I, O ออกกันอ่านสับสนกับ 1, 0
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** สุ่มรหัสผ่านชั่วคราวสำหรับพนักงานที่เพิ่งลงทะเบียน — คุมให้มีตัวใหญ่/เล็ก/เลข/สัญลักษณ์อย่างละ 1 ตัวขึ้นไปเสมอ */
export function generateTempPassword(length = 12): string {
  const chars = [UPPER, LOWER, DIGITS, SYMBOLS].map((pool) => pool[randomInt(pool.length)]);
  while (chars.length < length) {
    chars.push(ALL[randomInt(ALL.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
