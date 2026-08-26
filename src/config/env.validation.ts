import * as Joi from 'joi';

/**
 * Validate เฉพาะ presence/type ของ env — ไม่เช็คว่าเป็นค่า placeholder หรือไม่
 * (ไม่งั้น dev ที่ยังไม่เปลี่ยนค่า default ใน .env จะ boot ไม่ขึ้นเลย)
 *
 * หมายเหตุ: src/config/typeorm.config.ts อ่าน DB_* ตรงจาก process.env ตอน import
 * (ก่อน ConfigModule validate เสร็จ) และมี fallback ของตัวเองอยู่แล้ว
 * validation ของ DB_* ที่นี่จึงเป็นการเช็คซ้ำเพื่อความชัดเจน ไม่ใช่ gate จริงของค่า connection
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().default('postgres'),
  DB_DATABASE: Joi.string().default('assetdb'),
  DB_SSL: Joi.boolean().default(false),
  DB_POOL_MAX: Joi.number().default(10),

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  // ใช้สร้างลิงก์ในอีเมลรีเซ็ตรหัสผ่าน (AuthService.forgotPassword) — ต้องชี้ไปที่ frontend ไม่ใช่ backend
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),

  // Swagger (/api/docs) ต้องใส่ทั้งคู่ถึงจะเปิดใน production ได้ — ไม่ใส่ = ปิด Swagger นอก development
  SWAGGER_USER: Joi.string().optional().allow(''),
  SWAGGER_PASSWORD: Joi.string().optional().allow(''),

  // ไฟล์แนบ (asset photo / เอกสารประกอบ) — เก็บบน Supabase Storage (private bucket)
  MAX_UPLOAD_SIZE_MB: Joi.number().default(10),
  SUPABASE_URL: Joi.string().optional().allow(''),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().optional().allow(''),
  SUPABASE_STORAGE_BUCKET: Joi.string().default('attachments'),
  // Microsoft SSO login ผ่าน Supabase Auth ใช้ SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ข้างบนนี้อยู่แล้ว
  // (SupabaseIdentityService เรียก auth.getUser ให้ Supabase เป็นคน verify token เอง ไม่ต้องมี secret แยก)
  // ฝั่ง frontend ต้องตั้ง VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY เองใน repo ของตัวเอง

  // อีเมลแจ้งเตือน — ถ้าไม่ใส่ SMTP_HOST ระบบจะ log แทนการส่งจริง (ดู MailService)
  SMTP_HOST: Joi.string().optional().allow(''),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  SMTP_FROM: Joi.string().optional().allow(''),
});
