import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalStatus, TicketStatus } from '@common/enums';
import { SupportTicket } from '../support-tickets/entities/support-ticket.entity';
import { SupportTicketsService } from '../support-tickets/support-tickets.service';
import { RequisitionsService } from '../requisitions/requisitions.service';
import { LineMessage, confirmActionMessage, staffTicketAcceptedMessage, textMessage } from './line-flex';

export interface StaffUser {
  employeeId: number;
  permissions: string[];
}

const RESOLVED_FROM_LINE = 'แก้ไขเรียบร้อย (ปิดงานจาก LINE)';
const REJECTED_FROM_LINE = 'ไม่อนุมัติผ่าน LINE';

/**
 * ปุ่มของเจ้าหน้าที่ IT ในการ์ดที่ถูก push เข้า LINE:
 *   a=sa&id=  รับงาน ticket           (ต้องมี ticket.manage)
 *   a=sr&id=  ปิดงานว่าแก้ไขเสร็จ     (ต้องมี ticket.manage และเป็นคนรับงาน) — ถามยืนยันก่อน (c=1)
 *   a=ra&id=&s=a|r  อนุมัติ/ไม่อนุมัติใบขอ (ต้องมี requisition.approve) — ถามยืนยันก่อน (c=1)
 *
 * data มาจากฝั่ง client — เช็คสิทธิ์ที่นี่ และกฎจริง (ลำดับผู้อนุมัติ, การเปลี่ยนสถานะที่อนุญาต, ล็อกกันกดพร้อมกัน)
 * ยังบังคับโดย service เดียวกับเว็บ (SupportTicketsService.updateStatus / RequisitionsService.approve)
 */
@Injectable()
export class LineStaffService {
  constructor(
    private tickets: SupportTicketsService,
    private requisitions: RequisitionsService,
    @InjectRepository(SupportTicket) private ticketRepo: Repository<SupportTicket>,
  ) {}

  async handle(user: StaffUser, params: URLSearchParams, webUrl?: string): Promise<LineMessage[]> {
    const action = params.get('a');
    const id = Number(params.get('id'));
    if (!Number.isInteger(id) || id <= 0) return [textMessage('ข้อมูลไม่ถูกต้อง')];
    try {
      if (action === 'sa') return [await this.acceptTicket(user, id, webUrl)];
      if (action === 'sr') return [await this.resolveTicket(user, id, params.get('c') === '1')];
      if (action === 'ra') return [await this.decideRequisition(user, id, params.get('s'), params.get('c') === '1')];
    } catch (err) {
      // กฎธุรกิจจาก service (ถูกอนุมัติไปแล้ว / ไม่ใช่ลำดับของคุณ ฯลฯ) — ข้อความไทยอ่านรู้เรื่องอยู่แล้ว
      if (err instanceof HttpException) return [textMessage(`ทำรายการไม่สำเร็จ: ${err.message}`)];
      throw err;
    }
    return [textMessage('ไม่รู้จักคำสั่งนี้')];
  }

  private async acceptTicket(user: StaffUser, ticketId: number, webUrl?: string): Promise<LineMessage> {
    if (!user.permissions.includes('ticket.manage')) return textMessage('บัญชีของคุณไม่มีสิทธิ์รับงานแจ้งปัญหา');
    const current = await this.ticketRepo.findOne({ where: { ticketId }, relations: ['assignedToEmployee'] });
    if (!current) return textMessage('ไม่พบงานนี้แล้ว');
    if (current.status !== TicketStatus.OPEN) return textMessage(this.takenText(current, user));

    const updated = await this.tickets.updateStatus(ticketId, { status: TicketStatus.IN_PROGRESS }, user.employeeId);
    // สองคนกดพร้อมกัน: updateStatus ล็อกแถวไว้ คนที่สองจะเห็นสถานะเดิมแต่ผู้รับงานเป็นคนแรก
    if (updated.assignedTo !== user.employeeId) {
      const latest = await this.ticketRepo.findOne({ where: { ticketId }, relations: ['assignedToEmployee'] });
      return textMessage(this.takenText(latest ?? updated, user));
    }
    return staffTicketAcceptedMessage(updated, webUrl);
  }

  private takenText(t: SupportTicket, user: StaffUser) {
    if (t.assignedTo === user.employeeId && t.status === TicketStatus.IN_PROGRESS) return `คุณรับงาน ${t.ticketNo} ไว้แล้ว`;
    const who = t.assignedToEmployee?.fullName;
    return `${t.ticketNo} ${who ? `มีผู้รับงานแล้ว (${who})` : 'ถูกดำเนินการไปแล้ว'} — สถานะตอนนี้: ${statusLabel(t.status)}`;
  }

  private async resolveTicket(user: StaffUser, ticketId: number, confirmed: boolean): Promise<LineMessage> {
    if (!user.permissions.includes('ticket.manage')) return textMessage('บัญชีของคุณไม่มีสิทธิ์ปิดงานแจ้งปัญหา');
    const t = await this.ticketRepo.findOne({ where: { ticketId } });
    if (!t) return textMessage('ไม่พบงานนี้แล้ว');
    if (t.assignedTo !== user.employeeId) return textMessage(`${t.ticketNo} ไม่ได้อยู่ในความรับผิดชอบของคุณ — ปิดงานบนเว็บแทน`);
    if (t.status !== TicketStatus.IN_PROGRESS) return textMessage(`${t.ticketNo} สถานะตอนนี้: ${statusLabel(t.status)} — ปิดจาก LINE ไม่ได้`);
    if (!confirmed) {
      return confirmActionMessage(
        `ยืนยันแก้ไขเสร็จ ${t.ticketNo}?`,
        `"${t.subject}"\nผู้แจ้งจะได้รับแจ้งทาง LINE ทันที (ต้องการใส่รายละเอียดวิธีแก้ ให้ปิดบนเว็บ)`,
        '🏁 ยืนยันแก้ไขเสร็จ',
        `a=sr&id=${ticketId}&c=1`,
      );
    }
    const updated = await this.tickets.updateStatus(ticketId, { status: TicketStatus.RESOLVED, resolution: RESOLVED_FROM_LINE }, user.employeeId);
    return textMessage(`🏁 ปิดงาน ${updated.ticketNo} เป็น "แก้ไขแล้ว" เรียบร้อย ผู้แจ้งได้รับแจ้งแล้ว`);
  }

  private async decideRequisition(user: StaffUser, requisitionId: number, decision: string | null, confirmed: boolean): Promise<LineMessage> {
    if (!user.permissions.includes('requisition.approve')) return textMessage('บัญชีของคุณไม่มีสิทธิ์อนุมัติใบขอเบิก/ยืม');
    if (decision !== 'a' && decision !== 'r') return textMessage('ข้อมูลไม่ถูกต้อง');
    const approve = decision === 'a';
    if (!confirmed) {
      return confirmActionMessage(
        approve ? 'ยืนยันอนุมัติใบขอนี้?' : 'ยืนยันไม่อนุมัติใบขอนี้?',
        approve ? 'ถ้าเป็นลำดับสุดท้าย ระบบจะจ่ายอุปกรณ์ให้ผู้ขอโดยอัตโนมัติ' : 'ผู้ขอจะได้รับแจ้งผลทาง LINE (ใส่เหตุผลได้บนเว็บ)',
        approve ? '✅ ยืนยันอนุมัติ' : '❌ ยืนยันไม่อนุมัติ',
        `a=ra&id=${requisitionId}&s=${decision}&c=1`,
        approve ? '#16A34A' : '#DC2626',
      );
    }
    const result = await this.requisitions.approve(
      requisitionId,
      { status: approve ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED, comment: approve ? undefined : REJECTED_FROM_LINE },
      user.employeeId,
    );
    if (!approve) return textMessage(`❌ ไม่อนุมัติ ${result.requisitionNo} แล้ว ผู้ขอได้รับแจ้งแล้ว`);
    return textMessage(
      result.overallStatus === ApprovalStatus.APPROVED
        ? `✅ อนุมัติ ${result.requisitionNo} ครบแล้ว ระบบจ่ายอุปกรณ์ให้ผู้ขอเรียบร้อย`
        : `✅ อนุมัติ ${result.requisitionNo} แล้ว ส่งต่อให้ผู้อนุมัติลำดับถัดไป`,
    );
  }
}

const STATUS_TEXT: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'รอดำเนินการ',
  [TicketStatus.IN_PROGRESS]: 'กำลังดำเนินการ',
  [TicketStatus.RESOLVED]: 'แก้ไขแล้ว',
  [TicketStatus.CLOSED]: 'ปิดงาน',
  [TicketStatus.CANCELLED]: 'ยกเลิก',
};
const statusLabel = (s: TicketStatus) => STATUS_TEXT[s];
