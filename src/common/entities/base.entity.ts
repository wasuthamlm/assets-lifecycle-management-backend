import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Abstract base ที่มี audit column มาตรฐาน (created_at / updated_at)
 * ตารางไหนต้องการ created_by/updated_by เพิ่มเติม ให้ extend แล้วเติม column เอง
 */
export abstract class BaseEntity {
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt: Date;
}
