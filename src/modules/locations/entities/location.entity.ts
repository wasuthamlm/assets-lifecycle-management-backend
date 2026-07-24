import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn({ name: 'location_id' })
  locationId: number;

  @Column({ name: 'company_id', nullable: true })
  companyId: number;

  @ManyToOne(() => Company, (c) => c.locations, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  locationName: string;

  @Column({ nullable: true, comment: 'คลัง / office / factory / ห้องเก็บของ' })
  locationType: string;

  @Column({ nullable: true })
  site: string;

  @Column({ name: 'parent_location_id', nullable: true })
  parentLocationId: number;

  @ManyToOne(() => Location, (l) => l.children, { nullable: true })
  @JoinColumn({ name: 'parent_location_id' })
  parent: Location;

  @OneToMany(() => Location, (l) => l.parent)
  children: Location[];

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;
}
