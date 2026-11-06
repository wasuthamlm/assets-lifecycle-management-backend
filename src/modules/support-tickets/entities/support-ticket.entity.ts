import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { TicketCategory, TicketPriority, TicketStatus } from '@common/enums';
import { Asset } from '../../assets/entities/asset.entity';
import { Assignment } from '../../assignments/entities/assignment.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Repair } from '../../repairs/entities/repair.entity';
import { Location } from '../../locations/entities/location.entity';

/** Snapshot ข้อมูลผู้แจ้ง ณ ตอนเปิด ticket — divisionName = ชื่อแผนกแม่ (department.parent) */
export interface TicketReporterInfo {
  fullName: string;
  departmentName: string | null;
  divisionName: string | null;
  phone: string | null;
}

/**
 * ⚠️ สมมติฐาน (ไม่มีใน DBML ที่แนบ) — ticket แจ้งปัญหา IT จากผู้ใช้ แยกจาก repairs เพราะ:
 * - ไม่จำเป็นต้องมีทรัพย์สิน (เน็ตหลุด/ลืมรหัส/ลงโปรแกรม)
 * - เปิด ticket ไม่เปลี่ยนสถานะ asset — ถ้าเสียจริง IT ค่อยกด "ส่งซ่อม" ซึ่งสร้าง repair แล้วผูก repairId กลับมา
 */
@Entity('support_tickets')
export class SupportTicket extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'ticket_id' })
  ticketId: number;

  @Column({ unique: true })
  ticketNo: string;

  @Column({ name: 'reported_by' })
  @Index('IDX_support_tickets_reported_by')
  reportedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'reported_by' })
  reportedByEmployee: Employee;

  /**
   * เก็บแยกจาก employees แบบเดียวกับ requisitions.documentInfo — ถ้าผู้แจ้งย้ายแผนก/เปลี่ยนเบอร์ภายหลัง
   * ticket เก่าต้องยังแสดงข้อมูลตามตอนที่แจ้งจริง
   */
  @Column({ name: 'reporter_info', type: 'jsonb' })
  reporterInfo: TicketReporterInfo;

  @Column({ type: 'enum', enum: TicketCategory })
  category: TicketCategory;

  @Column()
  subject: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** อาคาร/สถานที่จาก master (ไม่บังคับ — master มีแค่ระดับ site/อาคาร) ตำแหน่งละเอียดอยู่ที่ locationDetail */
  @Column({ name: 'location_id', nullable: true })
  locationId: number | null;

  @ManyToOne(() => Location, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @Column({ comment: 'ชั้น/ห้อง/โต๊ะ ที่ทีม IT ต้องเดินไป' })
  locationDetail: string;

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.NORMAL })
  priority: TicketPriority;

  @Column({ name: 'asset_id', nullable: true })
  @Index('IDX_support_tickets_asset_id')
  assetId: number | null;

  @ManyToOne(() => Asset, { nullable: true })
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ name: 'assignment_id', nullable: true, comment: 'การเบิก/ยืมที่ผู้แจ้งถืออยู่ตอนแจ้ง (เช่น ยืมสาย HDMI แล้วใช้ไม่ได้)' })
  assignmentId: number | null;

  @ManyToOne(() => Assignment, { nullable: true })
  @JoinColumn({ name: 'assignment_id' })
  assignment: Assignment;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  @Index('IDX_support_tickets_status')
  status: TicketStatus;

  @Column({ name: 'assigned_to', nullable: true, comment: 'เจ้าหน้าที่ IT ที่รับงาน' })
  assignedTo: number | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignedToEmployee: Employee;

  @Column({ name: 'repair_id', nullable: true, comment: 'งานซ่อมที่สร้างจาก ticket นี้ (กด "ส่งซ่อม")' })
  repairId: number | null;

  @ManyToOne(() => Repair, { nullable: true })
  @JoinColumn({ name: 'repair_id' })
  repair: Repair;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;
}
