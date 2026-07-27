import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { Company } from '../../companies/entities/company.entity';

/**
 * รายชื่อโดเมนอีเมลที่อนุญาตให้ login เข้าระบบผ่าน Microsoft SSO ได้
 * เฉพาะโดเมนที่อยู่ในรายการนี้ (และ isEnabled = true) เท่านั้นที่ผ่านการเช็คตอน login
 */
@Entity('allowed_domains')
export class AllowedDomain extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'allowed_domain_id' })
  allowedDomainId: number;

  @Column({ unique: true, comment: 'เช่น millimedthailand.com (ไม่รวม @)' })
  domain: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: number | null;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;
}
