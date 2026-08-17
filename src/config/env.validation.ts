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

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
});
