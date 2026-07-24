import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Requisition } from './requisition.entity';
import { Asset } from '../../assets/entities/asset.entity';
import { StockItem } from '../../stock/entities/stock-item.entity';

@Entity('requisition_items')
export class RequisitionItem {
  @PrimaryGeneratedColumn({ name: 'requisition_item_id' })
  requisitionItemId: number;

  @Column({ name: 'requisition_id' })
  requisitionId: number;

  @ManyToOne(() => Requisition, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requisition_id' })
  requisition: Requisition;

  @Column({ name: 'asset_id', nullable: true, comment: 'กรณีขอ serialized asset เฉพาะเครื่อง' })
  assetId: number;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ name: 'stock_item_id', nullable: true, comment: 'กรณีขอของ consumable/bulk' })
  stockItemId: number;

  @ManyToOne(() => StockItem)
  @JoinColumn({ name: 'stock_item_id' })
  stockItem: StockItem;

  @Column({ type: 'int', default: 1, comment: 'ใช้กับ stock_item เท่านั้น, asset ใช้ 1 เสมอ' })
  quantity: number;
}
