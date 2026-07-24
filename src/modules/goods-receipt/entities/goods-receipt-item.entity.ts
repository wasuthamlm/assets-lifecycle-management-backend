import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GoodsReceipt } from './goods-receipt.entity';
import { PurchaseOrderItem } from '../../purchasing/entities/purchase-order-item.entity';
import { Asset } from '../../assets/entities/asset.entity';
import { StockItem } from '../../stock/entities/stock-item.entity';

/**
 * ต้องมีค่าอย่างใดอย่างหนึ่งระหว่าง assetId กับ stockItemId เท่านั้น (XOR)
 * บังคับด้วย CHECK constraint ระดับ DB (ดู migration) — ฝั่ง service ก็ validate ซ้ำอีกชั้น
 */
@Entity('goods_receipt_items')
@Check(
  `("asset_id" IS NOT NULL AND "stock_item_id" IS NULL) OR ("asset_id" IS NULL AND "stock_item_id" IS NOT NULL)`,
)
export class GoodsReceiptItem {
  @PrimaryGeneratedColumn({ name: 'receipt_item_id' })
  receiptItemId: number;

  @Column({ name: 'receipt_id' })
  receiptId: number;

  @ManyToOne(() => GoodsReceipt, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  goodsReceipt: GoodsReceipt;

  @Column({ name: 'po_item_id', nullable: true })
  poItemId: number;

  @ManyToOne(() => PurchaseOrderItem)
  @JoinColumn({ name: 'po_item_id' })
  purchaseOrderItem: PurchaseOrderItem;

  @Column({ name: 'asset_id', type: 'int', nullable: true, comment: 'กรณี serialized asset — 1 แถวต่อ 1 ชิ้น' })
  assetId: number | null;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ name: 'stock_item_id', type: 'int', nullable: true, comment: 'กรณี consumable/bulk' })
  stockItemId: number | null;

  @ManyToOne(() => StockItem)
  @JoinColumn({ name: 'stock_item_id' })
  stockItem: StockItem;

  @Column({ type: 'int', nullable: true, comment: 'ใช้กับ stock_item_id (bulk) เท่านั้น, serialized ใช้ 1 เสมอ' })
  receivedQuantity: number | null;

  @Column({ nullable: true })
  conditionOnReceipt: string;
}
