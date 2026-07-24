import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { AssignmentType, HolderType, ReturnCondition } from '@common/enums';
import { Asset } from '../../assets/entities/asset.entity';
import { Requisition } from '../../requisitions/entities/requisition.entity';
import { Employee } from '../../employees/entities/employee.entity';

/**
 * ⚠️ สมมติฐาน (ไม่มีใน DBML ที่แนบ) — บันทึกการ "ส่งมอบ/รับคืน" ของ asset แต่ละชิ้น
 * แก้ปัญหา endpoint ซ้ำซ้อนระหว่าง assignment/movement ตามที่ระบุใน Note ต้นไฟล์:
 * assignment = สถานะ "การถือครองปัจจุบัน" ของ asset หนึ่งชิ้น (มี due date/condition ตอนคืน)
 * movement   = audit trail log ของทุกการเคลื่อนไหว (append-only, ดู modules/movements)
 * assignment ใหม่ถูกสร้างเสมอเมื่อมีการ issue/return/transfer และจะ insert movement คู่กันเสมอ 1:1
 */
@Entity('assignments')
export class Assignment extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'assignment_id' })
  assignmentId: number;

  @Column({ name: 'asset_id' })
  assetId: number;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ name: 'requisition_id', nullable: true })
  requisitionId: number;

  @ManyToOne(() => Requisition)
  @JoinColumn({ name: 'requisition_id' })
  requisition: Requisition;

  @Column({ type: 'enum', enum: AssignmentType })
  assignmentType: AssignmentType;

  @Column({ type: 'enum', enum: HolderType })
  holderType: HolderType;

  @Column({ comment: 'polymorphic — ตาม holderType' })
  holderId: number;

  @Column({ type: 'timestamp' })
  issuedDate: Date;

  @Column({ name: 'issued_by' })
  issuedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'issued_by' })
  issuedByEmployee: Employee;

  @Column({ type: 'date', nullable: true, comment: 'กำหนดคืน (borrow/temporary_loan)' })
  dueDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  returnedDate: Date;

  @Column({ name: 'received_by', nullable: true })
  receivedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'received_by' })
  receivedByEmployee: Employee;

  @Column({ type: 'enum', enum: ReturnCondition, nullable: true })
  returnCondition: ReturnCondition;

  @Column({ type: 'text', nullable: true })
  notes: string;
}
