import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';
import { ApprovalStatus, NotificationType } from '@common/enums';

describe('RequisitionsService#findOne (ownership scoping)', () => {
  const buildService = (requisition: any) => {
    const repo = { findOne: jest.fn().mockResolvedValue(requisition) } as any;
    const itemRepo = {} as any;
    const approvalRepo = {} as any;
    const dataSource = {} as any;
    const notifications = { notify: jest.fn() } as any;
    const attachments = {} as any;
    return new RequisitionsService(repo, itemRepo, approvalRepo, dataSource, notifications, attachments);
  };

  it('allows the requester to view their own requisition', async () => {
    const service = buildService({ requisitionId: 1, requestedBy: 10 });
    await expect(service.findOne(1, { employeeId: 10, permissions: [] })).resolves.toEqual(
      expect.objectContaining({ requisitionId: 1 }),
    );
  });

  it('rejects a different employee without requisition.view_all', async () => {
    const service = buildService({ requisitionId: 1, requestedBy: 10 });
    await expect(service.findOne(1, { employeeId: 99, permissions: [] })).rejects.toThrow(ForbiddenException);
  });

  it('allows any employee with requisition.view_all', async () => {
    const service = buildService({ requisitionId: 1, requestedBy: 10 });
    await expect(
      service.findOne(1, { employeeId: 99, permissions: ['requisition.view_all'] }),
    ).resolves.toEqual(expect.objectContaining({ requisitionId: 1 }));
  });

  it('throws NotFoundException when the requisition does not exist', async () => {
    const service = buildService(null);
    await expect(service.findOne(1, { employeeId: 10, permissions: [] })).rejects.toThrow(NotFoundException);
  });
});

describe('RequisitionsService attachments (ownership scoping)', () => {
  function buildService(requisition: any, attachmentsOverrides: Partial<Record<'findByReference' | 'saveUpload' | 'remove', jest.Mock>> = {}) {
    const repo = { findOne: jest.fn().mockResolvedValue(requisition) } as any;
    const itemRepo = {} as any;
    const approvalRepo = {} as any;
    const dataSource = {} as any;
    const notifications = { notify: jest.fn() } as any;
    const attachments = {
      findByReference: jest.fn().mockResolvedValue([]),
      saveUpload: jest.fn().mockResolvedValue({ attachmentId: 1 }),
      remove: jest.fn().mockResolvedValue({ success: true }),
      ...attachmentsOverrides,
    } as any;
    const service = new RequisitionsService(repo, itemRepo, approvalRepo, dataSource, notifications, attachments);
    return { service, attachments };
  }

  it('blocks a non-owner without requisition.view_all from listing attachments', async () => {
    const { service } = buildService({ requisitionId: 1, requestedBy: 10, approvals: [] });
    await expect(service.listAttachments(1, { employeeId: 99, permissions: [] })).rejects.toThrow(ForbiddenException);
  });

  it('lets the owner list their own requisition attachments', async () => {
    const { service, attachments } = buildService({ requisitionId: 1, requestedBy: 10, approvals: [] });
    await service.listAttachments(1, { employeeId: 10, permissions: [] });
    expect(attachments.findByReference).toHaveBeenCalledWith('requisition', 1);
  });

  it('rejects deleting an attachment that does not belong to this requisition', async () => {
    const { service } = buildService(
      { requisitionId: 1, requestedBy: 10, approvals: [] },
      { findByReference: jest.fn().mockResolvedValue([{ attachmentId: 5 }]) },
    );
    await expect(service.removeAttachment(1, 999, { employeeId: 10, permissions: [] })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('allows deleting an attachment that does belong to this requisition', async () => {
    const { service, attachments } = buildService(
      { requisitionId: 1, requestedBy: 10, approvals: [] },
      { findByReference: jest.fn().mockResolvedValue([{ attachmentId: 5 }]) },
    );
    await service.removeAttachment(1, 5, { employeeId: 10, permissions: [] });
    expect(attachments.remove).toHaveBeenCalledWith(5);
  });
});

describe('RequisitionsService#approve (concurrency-safe)', () => {
  function buildService({ requisition, approvals }: { requisition: any; approvals: any[] }) {
    const managerFindOne = jest.fn().mockResolvedValue(requisition);
    const managerFind = jest.fn().mockResolvedValue(approvals);
    const managerSave = jest.fn().mockImplementation((entity: any) => Promise.resolve(entity));
    const manager = { findOne: managerFindOne, find: managerFind, save: managerSave } as any;
    const dataSource = { transaction: jest.fn().mockImplementation((cb: any) => cb(manager)) } as any;
    const repo = { findOne: jest.fn().mockResolvedValue({ ...requisition, approvals }) } as any;
    const itemRepo = {} as any;
    const approvalRepo = {} as any;
    const notifications = { notify: jest.fn() } as any;
    const attachments = {} as any;
    const service = new RequisitionsService(repo, itemRepo, approvalRepo, dataSource, notifications, attachments);
    return { service, manager, dataSource, notifications };
  }

  it('locks the requisition row with pessimistic_write inside a transaction, not a plain read', async () => {
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requisitionNo: 'Req-Equipment-1',
      overallStatus: ApprovalStatus.PENDING,
    };
    const approvals = [{ requisitionId: 1, approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING }];
    const { service, manager, dataSource } = buildService({ requisition, approvals });

    await service.approve(1, { status: ApprovalStatus.APPROVED } as any, 5);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ where: { requisitionId: 1 }, lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('rejects a second concurrent approve once the row shows it was already actioned', async () => {
    // จำลอง "รอบที่สอง" ของสองคำขอที่แข่งกัน — ตัวแรกอนุมัติผ่านไปแล้ว ตัวที่สองมาอ่านซ้ำหลังปลดล็อก
    // จะเห็น overallStatus ที่ commit ไปแล้วจากตัวแรก ไม่ใช่ snapshot เดิมตอนเริ่ม request
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requisitionNo: 'Req-Equipment-1',
      overallStatus: ApprovalStatus.APPROVED,
    };
    const { service } = buildService({ requisition, approvals: [] });

    await expect(service.approve(1, { status: ApprovalStatus.APPROVED } as any, 5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('notifies the next-level approver after a non-final approval', async () => {
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requisitionNo: 'Req-Equipment-1',
      overallStatus: ApprovalStatus.PENDING,
    };
    const approvals = [
      { requisitionId: 1, approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING },
      { requisitionId: 1, approvalLevel: 2, approverId: 6, status: ApprovalStatus.PENDING },
    ];
    const { service, notifications } = buildService({ requisition, approvals });

    await service.approve(1, { status: ApprovalStatus.APPROVED } as any, 5);

    expect(notifications.notify).toHaveBeenCalledWith(
      6,
      NotificationType.REQUISITION_PENDING_APPROVAL,
      expect.any(String),
      expect.any(String),
      'requisition',
      1,
    );
  });

  it('notifies the requester once the final level approves', async () => {
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requisitionNo: 'Req-Equipment-1',
      overallStatus: ApprovalStatus.PENDING,
    };
    const approvals = [{ requisitionId: 1, approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING }];
    const { service, notifications } = buildService({ requisition, approvals });

    await service.approve(1, { status: ApprovalStatus.APPROVED } as any, 5);

    expect(notifications.notify).toHaveBeenCalledWith(
      10,
      NotificationType.REQUISITION_APPROVED,
      expect.any(String),
      expect.any(String),
      'requisition',
      1,
    );
  });

  it('rejects when the acting approver is not the current pending level', async () => {
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requisitionNo: 'Req-Equipment-1',
      overallStatus: ApprovalStatus.PENDING,
    };
    const approvals = [{ requisitionId: 1, approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING }];
    const { service } = buildService({ requisition, approvals });

    await expect(service.approve(1, { status: ApprovalStatus.APPROVED } as any, 999)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
