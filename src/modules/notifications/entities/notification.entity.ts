import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NotificationType } from '@common/enums';
import { Employee } from '../../employees/entities/employee.entity';

/**
 * ไม่มีใน DBML — เพิ่มเข้ามารองรับการแจ้งเตือนในระบบ (ดู NotificationsService.notify())
 * ใช้ referenceType/referenceId แบบเดียวกับ Attachment เพื่อ deep-link กลับไปยังรายการต้นเรื่อง
 */
@Entity('notifications')
@Index('IDX_notifications_recipient', ['recipientEmployeeId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn({ name: 'notification_id' })
  notificationId: number;

  @Column({ name: 'recipient_employee_id' })
  recipientEmployeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'recipient_employee_id' })
  recipient: Employee;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'reference_type', type: 'varchar', nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'int', nullable: true })
  referenceId: number | null;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  // ผู้ใช้กด "ลบ"/"เคลียร์ทั้งหมด" ทิ้ง — ซ่อนจากรายการที่แสดง ไม่ได้ลบแถวจริงออกจาก DB (เก็บไว้เป็นประวัติ)
  @Column({ name: 'dismissed_at', type: 'timestamp', nullable: true })
  dismissedAt: Date | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;
}
