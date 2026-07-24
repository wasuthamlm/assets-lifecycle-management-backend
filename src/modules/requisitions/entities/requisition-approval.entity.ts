import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Requisition } from './requisition.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { ApprovalStatus } from '@common/enums';

/**
 * รองรับ multi-level approval — 1 requisition มีได้หลายแถว approval เรียงตาม approvalLevel
 */
@Entity('requisition_approvals')
export class RequisitionApproval {
  @PrimaryGeneratedColumn({ name: 'approval_id' })
  approvalId: number;

  @Column({ name: 'requisition_id' })
  requisitionId: number;

  @ManyToOne(() => Requisition, (r) => r.approvals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requisition_id' })
  requisition: Requisition;

  @Column({ type: 'int', comment: 'ลำดับชั้นการอนุมัติ 1,2,3...' })
  approvalLevel: number;

  @Column({ name: 'approver_id' })
  approverId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'approver_id' })
  approver: Employee;

  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  status: ApprovalStatus;

  @Column({ type: 'timestamp', nullable: true })
  actionedAt: Date;

  @Column({ type: 'text', nullable: true })
  comment: string | null;
}
