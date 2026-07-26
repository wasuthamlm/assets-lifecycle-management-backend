import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { WarrantyStatus } from '@common/enums';
import { Asset } from '../../assets/entities/asset.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';

/** ⚠️ สมมติฐาน (ไม่มีใน DBML ที่แนบ) — ตาม warranty_status_enum ที่ประกาศไว้แล้ว */
@Entity('warranties')
export class Warranty extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'warranty_id' })
  warrantyId: number;

  @Column({ name: 'asset_id' })
  @Index('IDX_warranties_asset_id')
  assetId: number;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ name: 'vendor_id', nullable: true, comment: 'บริษัทประกัน/ผู้รับประกัน' })
  vendorId: number;

  @ManyToOne(() => Vendor)
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  @Column({ type: 'enum', enum: WarrantyStatus, default: WarrantyStatus.ACTIVE })
  status: WarrantyStatus;

  @Column({ type: 'text', nullable: true })
  coverageDetail: string;
}
