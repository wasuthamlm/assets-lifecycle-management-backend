import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { RepairStatus, RepairResult } from '@common/enums';
import { Asset } from '../../assets/entities/asset.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';
import { Employee } from '../../employees/entities/employee.entity';

/** ⚠️ สมมติฐาน (ไม่มีใน DBML ที่แนบ) — ตาม repair_status_enum / repair_result_enum ที่ประกาศไว้แล้ว */
@Entity('repairs')
export class Repair extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'repair_id' })
  repairId: number;

  @Column({ name: 'asset_id' })
  @Index('IDX_repairs_asset_id')
  assetId: number;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ name: 'reported_by' })
  reportedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'reported_by' })
  reportedByEmployee: Employee;

  @Column({ type: 'text', nullable: true })
  problemDescription: string;

  @Column({ type: 'enum', enum: RepairStatus, default: RepairStatus.REPORTED })
  status: RepairStatus;

  @Column({ name: 'vendor_id', nullable: true, comment: 'ผู้รับซ่อม กรณีส่งซ่อมนอก' })
  vendorId: number;

  @ManyToOne(() => Vendor)
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;

  @Column({ type: 'timestamp', nullable: true })
  sentToVendorDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  repairedDate: Date;

  @Column({ type: 'enum', enum: RepairResult, nullable: true })
  result: RepairResult;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  repairCost: number;

  @Column({ type: 'text', nullable: true })
  notes: string;
}
