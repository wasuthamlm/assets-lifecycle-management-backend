import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';
import { AssetCategory } from '../../asset-categories/entities/asset-category.entity';

@Entity('purchase_order_items')
export class PurchaseOrderItem {
  @PrimaryGeneratedColumn({ name: 'po_item_id' })
  poItemId: number;

  @Column({ name: 'po_id' })
  poId: number;

  @ManyToOne(() => PurchaseOrder, (po) => po.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'po_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'category_id', nullable: true })
  categoryId: number;

  @ManyToOne(() => AssetCategory)
  @JoinColumn({ name: 'category_id' })
  category: AssetCategory;

  @Column()
  itemDescription: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  unitPrice: number;

  @Column({ type: 'int', default: 0 })
  receivedQuantity: number;
}
