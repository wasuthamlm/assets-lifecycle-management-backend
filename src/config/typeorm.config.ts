import { DataSource, DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * ตั้งค่ากลางของ TypeORM DataSource
 * - ใช้ SnakeNamingStrategy เพราะ DB เป็น snake_case (asset_no, created_at ฯลฯ)
 *   แต่ entity property เขียนแบบ camelCase ได้ตามปกติ ไม่ต้องใส่ @Column({name:...}) ทุกฟิลด์
 * - synchronize: false เสมอ — ใช้ migration ควบคุม schema เท่านั้น
 * - ใช้ไฟล์เดียวกันทั้งตอน runtime (NestJS ConfigModule) และตอนรัน CLI (migration:generate/run)
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'assetdb',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  migrationsTableName: 'typeorm_migrations',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
