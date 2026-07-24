import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { PurchaseOrder } from '../../purchasing/entities/purchase-order.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Location } from '../../locations/entities/location.entity';
import { GoodsReceiptItem } from './goods-receipt-item.entity';

@Entity('goods_receipts')
export class GoodsReceipt {
  @PrimaryGeneratedColumn({ name: 'receipt_id' })
  receiptId: number;

  @Column({ unique: true })
  receiptNo: string;

  @Column({ name: 'po_id', nullable: true })
  poId: number;

  @ManyToOne(() => PurchaseOrder)
  @JoinColumn({ name: 'po_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ type: 'date', nullable: true })
  receiptDate: Date;

  @Column({ name: 'received_by', nullable: true })
  receivedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'received_by' })
  receivedByEmployee: Employee;

  @Column({ name: 'location_id', nullable: true, comment: 'คลังที่รับเข้า' })
  locationId: number;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @OneToMany(() => GoodsReceiptItem, (i) => i.goodsReceipt)
  items: GoodsReceiptItem[];
}
