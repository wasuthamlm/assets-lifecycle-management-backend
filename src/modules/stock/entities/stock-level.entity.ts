import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { StockItem } from './stock-item.entity';
import { Location } from '../../locations/entities/location.entity';

@Entity('stock_levels')
@Index(['stockItemId', 'locationId'], { unique: true })
export class StockLevel {
  @PrimaryGeneratedColumn({ name: 'stock_level_id' })
  stockLevelId: number;

  @Column({ name: 'stock_item_id' })
  stockItemId: number;

  @ManyToOne(() => StockItem, (si) => si.stockLevels)
  @JoinColumn({ name: 'stock_item_id' })
  stockItem: StockItem;

  @Column({ name: 'location_id' })
  locationId: number;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @Column({ type: 'int', default: 0 })
  quantityOnHand: number;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt: Date;
}
