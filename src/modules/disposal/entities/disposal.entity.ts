import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DisposalMethod } from '@common/enums';
import { Asset } from '../../assets/entities/asset.entity';
import { Employee } from '../../employees/entities/employee.entity';

/** ⚠️ สมมติฐาน (ไม่มีใน DBML ที่แนบ) — ตาม disposal_method_enum ที่ประกาศไว้แล้ว */
@Entity('disposals')
export class Disposal {
  @PrimaryGeneratedColumn({ name: 'disposal_id' })
  disposalId: number;

  @Column({ name: 'asset_id', unique: true })
  assetId: number;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ type: 'enum', enum: DisposalMethod })
  disposalMethod: DisposalMethod;

  @Column({ type: 'date' })
  disposalDate: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, comment: 'มูลค่าที่ขายได้ (ถ้ามี)' })
  saleAmount: number;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'approved_by' })
  approvedByEmployee: Employee;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;
}
