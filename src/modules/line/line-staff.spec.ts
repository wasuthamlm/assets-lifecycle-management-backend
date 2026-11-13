import { ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, TicketCategory, TicketStatus } from '@common/enums';
import { LineStaffService } from './line-staff.service';

const it_ = { employeeId: 1, permissions: ['ticket.manage', 'requisition.approve'] };
const employee = { employeeId: 7, permissions: ['ticket.create'] };
const json = (m: unknown) => JSON.stringify(m);
const p = (s: string) => new URLSearchParams(s);

const ticket = (over: any = {}) => ({
  ticketId: 42,
  ticketNo: 'IT-2611-0009',
  subject: 'เปิดเมลไม่ได้',
  category: TicketCategory.OTHER,
  status: TicketStatus.OPEN,
  assignedTo: null,
  assignedToEmployee: null,
  ...over,
});

function build(current: any = ticket()) {
  const tickets = {
    updateStatus: jest.fn(async (_id: number, dto: any, by: number) => ({ ...current, status: dto.status, assignedTo: current.assignedTo ?? by })),
  } as any;
  const requisitions = {
    approve: jest.fn().mockResolvedValue({ requisitionNo: 'Req-Borrow-3', overallStatus: ApprovalStatus.APPROVED }),
  } as any;
  const ticketRepo = { findOne: jest.fn().mockResolvedValue(current) } as any;
  return { service: new LineStaffService(tickets, requisitions, ticketRepo), tickets, requisitions };
}

describe('LineStaffService', () => {
  it('IT accepts an open ticket → in_progress assigned to them', async () => {
    const { service, tickets } = build();
    const out = await service.handle(it_, p('a=sa&id=42'));
    expect(tickets.updateStatus).toHaveBeenCalledWith(42, { status: TicketStatus.IN_PROGRESS }, 1);
    expect(json(out)).toContain('คุณรับงานนี้แล้ว');
    expect(json(out)).toContain('a=sr&id=42'); // ปุ่มปิดงานต่อ
  });

  it('second IT sees who already took the job', async () => {
    const { service, tickets } = build(
      ticket({ status: TicketStatus.IN_PROGRESS, assignedTo: 2, assignedToEmployee: { fullName: 'สมศักดิ์ ไอที' } }),
    );
    const out = await service.handle(it_, p('a=sa&id=42'));
    expect(tickets.updateStatus).not.toHaveBeenCalled();
    expect(json(out)).toContain('สมศักดิ์ ไอที');
  });

  it('employees without ticket.manage cannot accept (tampered postback)', async () => {
    const { service, tickets } = build();
    expect(json(await service.handle(employee, p('a=sa&id=42')))).toContain('ไม่มีสิทธิ์');
    expect(tickets.updateStatus).not.toHaveBeenCalled();
  });

  it('resolve asks for confirmation first and only the assignee can do it', async () => {
    const mine = ticket({ status: TicketStatus.IN_PROGRESS, assignedTo: 1 });
    const { service, tickets } = build(mine);
    expect(json(await service.handle(it_, p('a=sr&id=42')))).toContain('a=sr&id=42&c=1');
    expect(tickets.updateStatus).not.toHaveBeenCalled();

    await service.handle(it_, p('a=sr&id=42&c=1'));
    expect(tickets.updateStatus).toHaveBeenCalledWith(42, expect.objectContaining({ status: TicketStatus.RESOLVED }), 1);

    const other = build(ticket({ status: TicketStatus.IN_PROGRESS, assignedTo: 2 }));
    expect(json(await other.service.handle(it_, p('a=sr&id=42&c=1')))).toContain('ไม่ได้อยู่ในความรับผิดชอบ');
    expect(other.tickets.updateStatus).not.toHaveBeenCalled();
  });

  it('approve/reject requisitions only after confirmation, through RequisitionsService.approve', async () => {
    const { service, requisitions } = build();
    expect(json(await service.handle(it_, p('a=ra&id=5&s=a')))).toContain('a=ra&id=5&s=a&c=1');
    expect(requisitions.approve).not.toHaveBeenCalled();

    expect(json(await service.handle(it_, p('a=ra&id=5&s=a&c=1')))).toContain('จ่ายอุปกรณ์');
    expect(requisitions.approve).toHaveBeenCalledWith(5, { status: ApprovalStatus.APPROVED, comment: undefined }, 1);

    await service.handle(it_, p('a=ra&id=5&s=r&c=1'));
    expect(requisitions.approve).toHaveBeenLastCalledWith(5, expect.objectContaining({ status: ApprovalStatus.REJECTED }), 1);
  });

  it('shows the service error when it is not their approval level', async () => {
    const { service, requisitions } = build();
    requisitions.approve.mockRejectedValue(new ForbiddenException('ไม่ใช่ลำดับการอนุมัติของคุณ'));
    expect(json(await service.handle(it_, p('a=ra&id=5&s=a&c=1')))).toContain('ไม่ใช่ลำดับการอนุมัติของคุณ');
  });
});
