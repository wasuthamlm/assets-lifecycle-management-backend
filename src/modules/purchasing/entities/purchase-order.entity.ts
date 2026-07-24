import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { PoStatus } from '@common/enums';
import { Vendor } from '../../vendors/entities/vendor.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';

@Entity('purchase_orders')
export class PurchaseOrder extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'po_id' })
  poId: number;

  @Column({ unique: true })
  poNo: string;

  @Column({ name: 'vendor_id', nullable: true })
  vendorId: number;

  @ManyToOne(() => Vendor)
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;

  @Column({ type: 'date', nullable: true })
  orderDate: Date | null;

  @Column({ type: 'date', nullable: true })
  expectedDeliveryDate: Date | null;

  @Column({ name: 'requested_by', nullable: true })
  requestedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'requested_by' })
  requestedByEmployee: Employee;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'approved_by' })
  approvedByEmployee: Employee;

  @Column({ type: 'enum', enum: PoStatus, default: PoStatus.DRAFT })
  status: PoStatus;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  totalAmount: number;

  @OneToMany(() => PurchaseOrderItem, (i) => i.purchaseOrder)
  items: PurchaseOrderItem[];
}
