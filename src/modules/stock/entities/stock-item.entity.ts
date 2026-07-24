import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { AssetCategory } from '../../asset-categories/entities/asset-category.entity';
import { StockLevel } from './stock-level.entity';

@Entity('stock_items')
export class StockItem extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'stock_item_id' })
  stockItemId: number;

  @Column({ name: 'category_id', nullable: true })
  categoryId: number;

  @ManyToOne(() => AssetCategory)
  @JoinColumn({ name: 'category_id' })
  category: AssetCategory;

  @Column()
  itemName: string;

  @Column({ nullable: true, comment: 'หน่วยนับ เช่น ชิ้น / อัน / กล่อง / เส้น' })
  unit: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => StockLevel, (sl) => sl.stockItem)
  stockLevels: StockLevel[];
}
