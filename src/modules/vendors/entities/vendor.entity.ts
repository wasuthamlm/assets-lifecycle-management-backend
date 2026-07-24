import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';

@Entity('vendors')
export class Vendor extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'vendor_id' })
  vendorId: number;

  @Column()
  vendorName: string;

  @Column({ nullable: true, comment: 'ผู้ขาย / ผู้รับซ่อม / บริษัทประกัน' })
  vendorType: string;

  @Column({ nullable: true })
  contactInfo: string;
}
