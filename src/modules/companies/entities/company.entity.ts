import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { Department } from '../../departments/entities/department.entity';
import { Location } from '../../locations/entities/location.entity';

@Entity('companies')
export class Company extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'company_id' })
  companyId: number;

  @Column({ unique: true })
  companyCode: string;

  @Column()
  companyName: string;

  @OneToMany(() => Department, (d) => d.company)
  departments: Department[];

  @OneToMany(() => Location, (l) => l.company)
  locations: Location[];
}
