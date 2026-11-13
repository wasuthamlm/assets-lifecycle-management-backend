import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { Employee } from '../employees/entities/employee.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Asset } from '../assets/entities/asset.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { Location } from '../locations/entities/location.entity';
import { NotificationType, TicketCategory, TicketSource, TicketStatus } from '@common/enums';

const EMPLOYEE = {
  employeeId: 7,
  fullName: 'สมชาย ใจดี',
  phone: '0812345678',
  department: { departmentName: 'บัญชี', parent: { departmentName: 'ฝ่ายการเงิน' } },
};

/** manager จำลอง — findOne คืนค่าตาม entity ที่ถาม, save คืน object ที่ส่งเข้าไป */
function buildManager(found: { employee?: any; assignment?: any; asset?: any; ticket?: any; location?: any } = {}) {
  return {
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === Employee) return found.employee ?? null;
      if (entity === Assignment) return found.assignment ?? null;
      if (entity === Asset) return found.asset ?? null;
      if (entity === SupportTicket) return found.ticket ?? null;
      if (entity === Location) return found.location ?? null;
      return null;
    }),
    create: jest.fn((_entity: unknown, data: any) => ({ ticketId: 1, ...data })),
    save: jest.fn(async (x: any) => x),
    query: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  };
}

function buildService(opts: { manager?: any; ticket?: any; attachments?: any; repairs?: any; lineMessaging?: any } = {}) {
  const manager = opts.manager ?? buildManager();
  const repo = { findOne: jest.fn().mockResolvedValue(opts.ticket ?? null) } as any;
  const notifications = {
    notify: jest.fn(),
    notifyByPermission: jest.fn(),
    publishChange: jest.fn(),
    findEmployeeIdsByPermission: jest.fn().mockResolvedValue([1, 2, 7]),
  } as any;
  const attachments = opts.attachments ?? ({ findByReference: jest.fn().mockResolvedValue([]), saveUpload: jest.fn(), remove: jest.fn() } as any);
  const repairs = opts.repairs ?? ({} as any);
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
  const service = new SupportTicketsService(repo, repairs, notifications, attachments, dataSource, opts.lineMessaging);
  return { service, manager, notifications, attachments, repairs };
}

const employeeUser = { employeeId: 7, permissions: ['ticket.create', 'ticket.view_own'] };
const hrUser = { employeeId: 20, permissions: ['ticket.create', 'ticket.view_own', 'ticket.view_all'] };
const itUser = { employeeId: 1, permissions: ['ticket.create', 'ticket.view_own', 'ticket.view_all', 'ticket.manage'] };

describe('SupportTicketsService#create', () => {
  it('snapshots name / department / division / phone and notifies ticket.manage holders', async () => {
    const { service, notifications } = buildService({ manager: buildManager({ employee: EMPLOYEE }) });

    const t = await service.create({ locationDetail: 'ชั้น 3 ห้องบัญชี', category: TicketCategory.HARDWARE, subject: 'โน้ตบุ๊กเปิดไม่ติด' }, employeeUser);

    expect(t.reporterInfo).toEqual({ fullName: 'สมชาย ใจดี', departmentName: 'บัญชี', divisionName: 'ฝ่ายการเงิน', phone: '0812345678' });
    expect(t.ticketNo).toMatch(/^IT-\d{4}-0001$/);
    expect(t.status).toBe(TicketStatus.OPEN);
    expect(notifications.notifyByPermission).toHaveBeenCalledWith(
      'ticket.manage', NotificationType.TICKET_CREATED, expect.any(String), expect.any(String), 'support_ticket', 1, { exclude: [7] },
    );
  });

  it('publishes a live change to ticket.view_all holders and the reporter', async () => {
    const { service, notifications } = buildService({ manager: buildManager({ employee: EMPLOYEE }) });
    await service.create({ locationDetail: 'ชั้น 3 ห้องบัญชี', category: TicketCategory.HARDWARE, subject: 'x' }, employeeUser);
    expect(notifications.publishChange).toHaveBeenCalledWith({
      topic: 'support_ticket', action: 'created', id: 1, audience: { permission: 'ticket.view_all', employeeIds: [7] },
    });
  });

  it('stores the location (building + floor/room) and includes it in the IT notification', async () => {
    const { service, notifications } = buildService({ manager: buildManager({ employee: EMPLOYEE, location: { locationId: 3 } }) });
    const t = await service.create({ category: TicketCategory.HARDWARE, subject: 'จอไม่ติด', locationId: 3, locationDetail: '  ชั้น 2 ห้อง 204  ' }, employeeUser);
    expect(t.locationId).toBe(3);
    expect(t.locationDetail).toBe('ชั้น 2 ห้อง 204');
    expect(notifications.notifyByPermission.mock.calls[0][3]).toContain('ชั้น 2 ห้อง 204');
  });

  it('rejects an unknown locationId', async () => {
    const { service } = buildService({ manager: buildManager({ employee: EMPLOYEE }) });
    await expect(
      service.create({ category: TicketCategory.HARDWARE, subject: 'x', locationId: 99, locationDetail: 'ชั้น 1' }, employeeUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses contactPhone from the form over the employee record', async () => {
    const { service } = buildService({ manager: buildManager({ employee: EMPLOYEE }) });
    const t = await service.create({ locationDetail: 'ชั้น 3 ห้องบัญชี', category: TicketCategory.OTHER, subject: 'x', contactPhone: '1234' }, employeeUser);
    expect(t.reporterInfo.phone).toBe('1234');
  });

  it('stores a typed device name when no held asset is picked, and drops it when one is', async () => {
    const { service } = buildService({ manager: buildManager({ employee: EMPLOYEE, assignment: { assignmentId: 55 } }) });
    const typed = await service.create({ locationDetail: 'ชั้น 3', category: TicketCategory.HARDWARE, subject: 'x', assetText: '  ปริ้นเตอร์ส่วนกลาง ชั้น 3  ' }, employeeUser);
    expect(typed.assetText).toBe('ปริ้นเตอร์ส่วนกลาง ชั้น 3');
    expect(typed.assetId).toBeNull();
    const picked = await service.create({ locationDetail: 'ชั้น 3', category: TicketCategory.HARDWARE, subject: 'x', assetId: 9, assetText: 'NB-001' }, employeeUser);
    expect(picked.assetText).toBeNull();
  });

  it('links the open borrow/assignment when the reporter holds the asset (borrowed HDMI case)', async () => {
    const { service } = buildService({ manager: buildManager({ employee: EMPLOYEE, assignment: { assignmentId: 55 } }) });
    const t = await service.create({ locationDetail: 'ชั้น 3 ห้องบัญชี', category: TicketCategory.ACCESSORY, subject: 'สาย HDMI เสียบไม่ได้', assetId: 9 }, employeeUser);
    expect(t.assetId).toBe(9);
    expect(t.assignmentId).toBe(55);
  });

  it('rejects an employee reporting an asset they do not hold', async () => {
    const { service } = buildService({ manager: buildManager({ employee: EMPLOYEE }) });
    await expect(
      service.create({ locationDetail: 'ชั้น 3 ห้องบัญชี', category: TicketCategory.HARDWARE, subject: 'x', assetId: 9 }, employeeUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets ticket.manage report any existing asset', async () => {
    const { service } = buildService({ manager: buildManager({ employee: { ...EMPLOYEE, employeeId: 1 }, asset: { assetId: 9 } }) });
    const t = await service.create({ locationDetail: 'ชั้น 3 ห้องบัญชี', category: TicketCategory.HARDWARE, subject: 'x', assetId: 9 }, itUser);
    expect(t.assetId).toBe(9);
    expect(t.assignmentId).toBeNull();
  });
});

describe('SupportTicketsService#findOne (ownership scoping)', () => {
  const ticket = { ticketId: 1, reportedBy: 7 };

  it('owner can view', async () => {
    await expect(buildService({ ticket }).service.findOne(1, employeeUser)).resolves.toBe(ticket);
  });

  it("employee cannot view someone else's ticket", async () => {
    await expect(buildService({ ticket }).service.findOne(1, { employeeId: 8, permissions: employeeUser.permissions })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hr (view_all) can view any ticket', async () => {
    await expect(buildService({ ticket }).service.findOne(1, hrUser)).resolves.toBe(ticket);
  });
});

describe('SupportTicketsService attachments', () => {
  const ticket = { ticketId: 1, reportedBy: 7 };
  const file = {} as Express.Multer.File;

  it('hr can list but not upload to a ticket that is not theirs (read-only)', async () => {
    const { service, attachments } = buildService({ ticket });
    await expect(service.listAttachments(1, hrUser)).resolves.toEqual([]);
    await expect(service.uploadAttachment(1, file, hrUser, 20)).rejects.toBeInstanceOf(ForbiddenException);
    expect(attachments.saveUpload).not.toHaveBeenCalled();
  });

  it('owner and ticket.manage can upload', async () => {
    const { service, attachments } = buildService({ ticket });
    await service.uploadAttachment(1, file, employeeUser, 7);
    await service.uploadAttachment(1, file, itUser, 1);
    expect(attachments.saveUpload).toHaveBeenCalledTimes(2);
  });
});

describe('SupportTicketsService#updateStatus', () => {
  it('taking an open ticket assigns it to the caller and notifies the reporter', async () => {
    const ticket = { ticketId: 1, ticketNo: 'IT-2611-0001', reportedBy: 7, status: TicketStatus.OPEN, assignedTo: null };
    const { service, notifications } = buildService({ manager: buildManager({ ticket }) });

    const t = await service.updateStatus(1, { status: TicketStatus.IN_PROGRESS }, 1);

    expect(t.assignedTo).toBe(1);
    expect(notifications.notify).toHaveBeenCalledWith(7, NotificationType.TICKET_STATUS_UPDATED, expect.any(String), expect.any(String), 'support_ticket', 1);
  });

  it('publishes a live change so other IT/hr screens refresh (prevents double pick-up)', async () => {
    const ticket = { ticketId: 1, reportedBy: 7, status: TicketStatus.OPEN, assignedTo: null };
    const { service, notifications } = buildService({ manager: buildManager({ ticket }) });
    await service.updateStatus(1, { status: TicketStatus.IN_PROGRESS }, 1);
    expect(notifications.publishChange).toHaveBeenCalledWith(expect.objectContaining({ topic: 'support_ticket', action: 'updated', id: 1 }));
  });

  it('rejects changing a closed ticket', async () => {
    const ticket = { ticketId: 1, reportedBy: 7, status: TicketStatus.CLOSED };
    const { service } = buildService({ manager: buildManager({ ticket }) });
    await expect(service.updateStatus(1, { status: TicketStatus.IN_PROGRESS }, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets resolvedAt on resolve and clears it on reopen', async () => {
    const ticket: any = { ticketId: 1, reportedBy: 7, status: TicketStatus.IN_PROGRESS, assignedTo: 1, resolvedAt: null };
    const { service } = buildService({ manager: buildManager({ ticket }) });
    await service.updateStatus(1, { status: TicketStatus.RESOLVED, resolution: 'เปลี่ยนสายใหม่ให้' }, 1);
    expect(ticket.resolvedAt).toBeInstanceOf(Date);
    await service.updateStatus(1, { status: TicketStatus.IN_PROGRESS }, 1);
    expect(ticket.resolvedAt).toBeNull();
  });
});

describe('SupportTicketsService#escalateToRepair', () => {
  it('creates a repair in the same transaction and links it to the ticket', async () => {
    const ticket: any = { ticketId: 1, ticketNo: 'IT-2611-0001', reportedBy: 7, status: TicketStatus.OPEN, assetId: 9, repairId: null, subject: 'จอไม่ติด', description: null };
    const manager = buildManager({ ticket });
    const repairs = {
      createInTransaction: jest.fn().mockResolvedValue({ repair: { repairId: 33 }, asset: { assetId: 9, assetNo: 'NB-001' } }),
      notifyRepairReported: jest.fn(),
    };
    const { service } = buildService({ manager, repairs });

    const t = await service.escalateToRepair(1, {}, 1);

    expect(repairs.createInTransaction).toHaveBeenCalledWith(manager, { assetId: 9, problemDescription: '[IT-2611-0001] จอไม่ติด', vendorId: undefined }, 1);
    expect(t.repairId).toBe(33);
    expect(t.status).toBe(TicketStatus.IN_PROGRESS);
    expect(repairs.notifyRepairReported).toHaveBeenCalled();
  });

  it('rejects a ticket without an asset', async () => {
    const ticket = { ticketId: 1, reportedBy: 7, status: TicketStatus.OPEN, assetId: null };
    const { service } = buildService({ manager: buildManager({ ticket }) });
    await expect(service.escalateToRepair(1, {}, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SupportTicketsService LINE channel', () => {
  const lineMessaging = () => ({ pushToEmployee: jest.fn().mockResolvedValue(undefined), pushToEmployees: jest.fn().mockResolvedValue(undefined) });
  const dto = { locationDetail: 'ชั้น 3', category: TicketCategory.HARDWARE, subject: 'จอไม่ติด' };

  it('defaults source to web and does not push to LINE', async () => {
    const line = lineMessaging();
    const { service } = buildService({ manager: buildManager({ employee: EMPLOYEE }), lineMessaging: line });
    const t = await service.create(dto, employeeUser);
    expect(t.source).toBe(TicketSource.WEB);
    expect(line.pushToEmployee).not.toHaveBeenCalled();
  });

  it('stores source=line, tags the IT notification and confirms back on LINE', async () => {
    const line = lineMessaging();
    const { service, notifications } = buildService({ manager: buildManager({ employee: EMPLOYEE }), lineMessaging: line });
    const t = await service.create(dto, employeeUser, { source: TicketSource.LINE });
    expect(t.source).toBe(TicketSource.LINE);
    expect(notifications.notifyByPermission.mock.calls[0][2]).toMatch(/^\[LINE\]/);
    expect(line.pushToEmployee).toHaveBeenCalledWith(7, expect.stringContaining(t.ticketNo));
  });

  it('pushes a "รับงาน" card to IT staff (not the reporter) only for LINE tickets', async () => {
    const line = lineMessaging();
    const { service } = buildService({ manager: buildManager({ employee: EMPLOYEE }), lineMessaging: line });
    await service.create(dto, employeeUser, { source: TicketSource.LINE });
    await new Promise((r) => setImmediate(r));
    expect(line.pushToEmployees).toHaveBeenCalledWith([1, 2], [expect.objectContaining({ type: 'flex' })]);
    expect(JSON.stringify(line.pushToEmployees.mock.calls[0][1])).toContain('a=sa&id=');

    const webLine = lineMessaging();
    await buildService({ manager: buildManager({ employee: EMPLOYEE }), lineMessaging: webLine }).service.create(dto, employeeUser);
    await new Promise((r) => setImmediate(r));
    expect(webLine.pushToEmployees).not.toHaveBeenCalled();
  });

  it('works without LineMessagingService (LINE not configured)', async () => {
    const { service } = buildService({ manager: buildManager({ employee: EMPLOYEE }) });
    await expect(service.create(dto, employeeUser, { source: TicketSource.LINE })).resolves.toBeDefined();
  });

  it('pushes status changes only for LINE tickets', async () => {
    const line = lineMessaging();
    const lineTicket = { ticketId: 1, ticketNo: 'IT-2611-0001', subject: 'x', reportedBy: 7, status: TicketStatus.OPEN, source: TicketSource.LINE };
    await buildService({ manager: buildManager({ ticket: lineTicket }), lineMessaging: line }).service.updateStatus(1, { status: TicketStatus.IN_PROGRESS }, 1);
    expect(line.pushToEmployee).toHaveBeenCalledWith(7, [expect.objectContaining({ type: 'flex' })]);
    expect(JSON.stringify(line.pushToEmployee.mock.calls[0][1])).toContain('กำลังดำเนินการ');

    const webLine = lineMessaging();
    const webTicket = { ...lineTicket, status: TicketStatus.OPEN, source: TicketSource.WEB };
    await buildService({ manager: buildManager({ ticket: webTicket }), lineMessaging: webLine }).service.updateStatus(1, { status: TicketStatus.IN_PROGRESS }, 1);
    expect(webLine.pushToEmployee).not.toHaveBeenCalled();
  });
});
