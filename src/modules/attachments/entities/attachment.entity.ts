import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';

/**
 * ⚠️ สมมติฐาน (ไม่มีใน DBML ที่แนบ) — Note ต้นไฟล์ระบุว่าเพิ่ม "attachments" เป็นหนึ่งใน
 * การปรับปรุงจากระบบเดิม จึงออกแบบเป็น polymorphic attachment table ใช้ร่วมกันได้ทุก entity
 * (asset, requisition, repair, goods_receipt ฯลฯ) ผ่าน reference_type/reference_id
 * ไฟล์จริงแนะนำเก็บบน object storage (S3/MinIO) แล้วเก็บแค่ path/url ไว้ในตารางนี้
 */
@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn({ name: 'attachment_id' })
  attachmentId: number;

  @Column({ name: 'reference_type', comment: 'asset / requisition / repair / goods_receipt / disposal ...' })
  referenceType: string;

  @Column({ name: 'reference_id' })
  referenceId: number;

  @Column()
  fileName: string;

  @Column()
  fileUrl: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ type: 'bigint', nullable: true })
  fileSizeBytes: number;

  @Column({ name: 'uploaded_by', nullable: true })
  uploadedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'uploaded_by' })
  uploadedByEmployee: Employee;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;
}
