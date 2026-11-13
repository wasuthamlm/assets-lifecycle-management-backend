#!/usr/bin/env node
/**
 * สร้าง/อัปเดต rich menu ของ LINE OA (เมนูปุ่มใหญ่ใต้แชท)
 *
 *   node scripts/line-rich-menu.mjs --validate   ตรวจรูปแบบกับ LINE อย่างเดียว ไม่เปลี่ยนอะไร
 *   node scripts/line-rich-menu.mjs              สร้างเมนูใหม่ + อัปโหลดรูป + ตั้งเป็นค่าเริ่มต้น แล้วลบเมนูชื่อเดิม
 *
 * อ่าน LINE_MESSAGING_ACCESS_TOKEN จาก environment หรือ .env — รันซ้ำได้ (แทนที่เมนูชื่อเดียวกัน)
 * ⚠️ ตั้งเป็นค่าเริ่มต้นแล้ว เพื่อนทุกคนของ OA จะเห็นเมนูนี้ทันที — deploy backend ที่รองรับปุ่มเหล่านี้ก่อนรัน
 * รูปมาจาก assets/line/rich-menu.png (ต้นฉบับ rich-menu.html) — ตำแหน่ง areas ด้านล่างต้องตรงกับ grid ในรูป
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MENU_NAME = 'it-service-main';
const IMAGE = join(ROOT, 'assets', 'line', 'rich-menu.png');

function loadToken() {
  if (process.env.LINE_MESSAGING_ACCESS_TOKEN) return process.env.LINE_MESSAGING_ACCESS_TOKEN.trim();
  const envFile = join(ROOT, '.env');
  if (!existsSync(envFile)) return '';
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('LINE_MESSAGING_ACCESS_TOKEN='));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

const postback = (data, displayText) => ({ type: 'postback', data, displayText });

// grid: แถวบน 2 ช่อง (สูง 1000) แถวล่าง 3 ช่อง (สูง 686) — ตรงกับ rich-menu.html
const richMenu = {
  size: { width: 2500, height: 1686 },
  selected: true, // เปิดเมนูค้างไว้ตอนเข้าแชท
  name: MENU_NAME,
  chatBarText: 'เมนูฝ่าย IT',
  areas: [
    { bounds: { x: 0, y: 0, width: 1250, height: 1000 }, action: postback('a=menu&m=ticket', 'แจ้งปัญหา IT') },
    { bounds: { x: 1250, y: 0, width: 1250, height: 1000 }, action: postback('a=menu&m=borrow', 'เบิก/ยืมอุปกรณ์') },
    { bounds: { x: 0, y: 1000, width: 833, height: 686 }, action: postback('a=menu&m=status', 'ติดตามสถานะ') },
    { bounds: { x: 833, y: 1000, width: 834, height: 686 }, action: postback('a=menu&m=assets', 'อุปกรณ์ของฉัน') },
    { bounds: { x: 1667, y: 1000, width: 833, height: 686 }, action: postback('a=menu&m=help', 'ช่วยเหลือ') },
  ],
};

async function call(token, method, url, body, contentType = 'application/json') {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': contentType } : {}) },
    body: body ? (contentType === 'application/json' ? JSON.stringify(body) : body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const token = loadToken();
  if (!token) throw new Error('ไม่พบ LINE_MESSAGING_ACCESS_TOKEN (ตั้งใน environment หรือ .env)');
  if (!existsSync(IMAGE)) throw new Error(`ไม่พบรูป ${IMAGE}`);

  await call(token, 'POST', 'https://api.line.me/v2/bot/richmenu/validate', richMenu);
  console.log('✔ รูปแบบ rich menu ถูกต้อง');
  if (process.argv.includes('--validate')) return;

  const { richmenus = [] } = await call(token, 'GET', 'https://api.line.me/v2/bot/richmenu/list');
  const old = richmenus.filter((m) => m.name === MENU_NAME);

  const { richMenuId } = await call(token, 'POST', 'https://api.line.me/v2/bot/richmenu', richMenu);
  console.log(`✔ สร้างเมนู ${richMenuId}`);
  await call(token, 'POST', `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, readFileSync(IMAGE), 'image/png');
  console.log('✔ อัปโหลดรูปแล้ว');
  await call(token, 'POST', `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`);
  console.log('✔ ตั้งเป็นเมนูเริ่มต้นของทุกคนแล้ว');

  for (const m of old) {
    await call(token, 'DELETE', `https://api.line.me/v2/bot/richmenu/${m.richMenuId}`);
    console.log(`✔ ลบเมนูเก่า ${m.richMenuId}`);
  }
}

main().catch((err) => {
  console.error(`✘ ${err.message}`);
  process.exit(1);
});
