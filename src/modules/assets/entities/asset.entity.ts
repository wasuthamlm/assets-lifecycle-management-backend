import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { AssetStatus, HolderType } from '@common/enums';
import { AssetCategory } from '../../asset-categories/entities/asset-category.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';
import { Location } from '../../locations/entities/location.entity';
import { Employee } from '../../employees/entities/employee.entity';

/**
 * Asset master — เฉพาะทรัพย์สินที่มี serial / ต้อง track เป็นชิ้น
 * ของ consumable/bulk ใช้ stock_items + stock_levels แทน (ดู modules/stock)
 *
 * current_holder_id เป็น "polymorphic FK" (อ้างได้ทั้ง employees/departments/locations/vendors
 * ตาม current_holder_type) — TypeORM ไม่รองรับ polymorphic relation ในตัว จึงไม่ผูก @ManyToOne ตรงๆ
 * ต้อง resolve เองผ่าน AssetsService.resolveHolder() (ดู assets.service.ts)
 * ระดับ DB ควบคุมด้วย CHECK constraint (ดู migration) จำกัดค่า current_holder_type ให้ตรง enum เท่านั้น
 */
@Entity('assets')
export class Asset extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'asset_id' })
  assetId: number;

  @Column({ unique: true, comment: 'เช่น FA-2026-00123' })
  assetNo: string;

  @Column({ name: 'category_id', nullable: true })
  @Index()
  categoryId: number;

  @ManyToOne(() => AssetCategory)
  @JoinColumn({ name: 'category_id' })
  category: AssetCategory;

  @Column()
  assetName: string;

  @Column({ nullable: true })
  @Index()
  serialNumber: string;

  @Column({ nullable: true })
  brandModel: string;

  @Column({ name: 'vendor_id', nullable: true, comment: 'ผู้ขายตอนซื้อ' })
  vendorId: number;

  @ManyToOne(() => Vendor)
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;

  @Column({ type: 'date', nullable: true })
  purchaseDate: Date | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  purchaseCost: number;

  @Column({ type: 'date', nullable: true })
  warrantyExpireDate: Date | null;

  @Column({ type: 'enum', enum: AssetStatus, nullable: true })
  currentStatus: AssetStatus;

  @Column({ name: 'current_location_id', nullable: true })
  currentLocationId: number;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'current_location_id' })
  currentLocation: Location;

  @Column({ type: 'enum', enum: HolderType, nullable: true })
  currentHolderType: HolderType | null;

  @Column({
    name: 'current_holder_id',
    type: 'int',
    nullable: true,
    comment: 'polymorphic — ดู currentHolderType ประกอบเพื่อ resolve เป็น employee/department/location/vendor',
  })
  @Index()
  currentHolderId: number | null;

  @Column({ type: 'jsonb', nullable: true, comment: 'เช่น license: {seats, license_key}' })
  attributes: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'created_by' })
  createdByEmployee: Employee;
}
