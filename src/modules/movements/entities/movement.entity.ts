import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MovementType, HolderType } from '@common/enums';
import { Asset } from '../../assets/entities/asset.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Location } from '../../locations/entities/location.entity';

/**
 * Append-only audit trail กลาง — ทุกการเปลี่ยนแปลงสถานะ/ที่อยู่/ผู้ถือครองของ asset
 * ต้อง insert แถวใหม่ที่นี่เสมอ (ไม่ update/delete) เพื่อให้ track ประวัติย้อนหลังได้ครบ
 * แก้ปัญหา endpoint ซ้ำซ้อนกับ assignments ตามที่ระบุใน Note ต้นไฟล์ — service อื่น (assignments,
 * repairs, warranty, disposal) เรียก MovementsService.log() หลัง commit การเปลี่ยนแปลงของตัวเองเสมอ
 */
@Entity('movements')
export class Movement {
  @PrimaryGeneratedColumn({ name: 'movement_id' })
  movementId: number;

  @Column({ name: 'asset_id' })
  assetId: number;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ type: 'enum', enum: MovementType })
  movementType: MovementType;

  @Column({ name: 'from_location_id', type: 'int', nullable: true })
  fromLocationId: number | null;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'from_location_id' })
  fromLocation: Location;

  @Column({ name: 'to_location_id', type: 'int', nullable: true })
  toLocationId: number | null;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'to_location_id' })
  toLocation: Location;

  @Column({ type: 'enum', enum: HolderType, nullable: true })
  fromHolderType: HolderType | null;

  @Column({ type: 'int', nullable: true })
  fromHolderId: number | null;

  @Column({ type: 'enum', enum: HolderType, nullable: true })
  toHolderType: HolderType | null;

  @Column({ type: 'int', nullable: true })
  toHolderId: number | null;

  @Column({ name: 'reference_type', type: 'varchar', nullable: true, comment: 'assignment / repair / warranty / disposal / goods_receipt' })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'int', nullable: true, comment: 'PK ของตารางต้นทางตาม reference_type' })
  referenceId: number | null;

  @Column({ name: 'performed_by' })
  performedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'performed_by' })
  performedByEmployee: Employee;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;
}
