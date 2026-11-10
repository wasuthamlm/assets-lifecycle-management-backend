/**
 * บังคับ process ให้ทำงานเป็น UTC — ต้อง import เป็นบรรทัดแรกของ main.ts และ typeorm.config.ts
 *
 * คอลัมน์เวลาใน DB เป็น timestamp (without time zone) และ DEFAULT now() ของ Postgres (session = UTC) เขียนเวลาแบบ UTC
 * ส่วน driver pg แปลง Date <-> timestamp ด้วย TZ ของ process — ถ้า process เป็นเวลาไทย (เช่นรัน dev บนเครื่อง Windows)
 * จะอ่านเวลา UTC ใน DB เป็นเวลาไทย ทำให้เวลาที่แสดงช้าไป 7 ชั่วโมง ตั้งเป็น UTC ให้ตรงกับ DB และ production container
 * การแสดงผล/ตัดวันตามเวลาไทยให้ใช้ common/utils/thai-date.util.ts หรือให้ frontend แปลงเอง
 */
process.env.TZ = 'UTC';
