import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { RequestType, ApprovalStatus } from '@common/enums';
import { Employee } from '../../employees/entities/employee.entity';
import { RequisitionItem } from './requisition-item.entity';
import { RequisitionApproval } from './requisition-approval.entity';

/**
 * ⚠️ ตารางนี้ไม่ได้อยู่ในไฟล์ DBML ที่แนบมา (ไฟล์ถูกตัดจบที่ goods_receipt_items)
 * แต่ enum request_type_enum / approval_status_enum ถูกประกาศไว้แล้วและ Note บนสุดของ
 * โปรเจกต์ระบุ flow "เบิก/ยืม" กับ "multi-level approval" ไว้ชัดเจน จึงออกแบบตารางนี้ตาม
 * สมมติฐานเพื่อให้ flow สมบูรณ์ — โปรดตรวจทานกับ DBML ฉบับเต็มอีกครั้งก่อนใช้งานจริง
 */
@Entity('requisitions')
export class Requisition extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'requisition_id' })
  requisitionId: number;

  @Column({ unique: true })
  requisitionNo: string;

  @Column({ name: 'requested_by' })
  @Index('IDX_requisitions_requested_by')
  requestedBy: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'requested_by' })
  requestedByEmployee: Employee;

  @Column({ type: 'enum', enum: RequestType })
  requestType: RequestType;

  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  overallStatus: ApprovalStatus;

  @Column({ type: 'date', nullable: true, comment: 'กำหนดคืน (เฉพาะ borrow)' })
  dueDate: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @OneToMany(() => RequisitionItem, (i) => i.requisition)
  items: RequisitionItem[];

  @OneToMany(() => RequisitionApproval, (a) => a.requisition)
  approvals: RequisitionApproval[];
}
