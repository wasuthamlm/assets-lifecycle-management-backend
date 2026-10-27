import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';
import { ApprovalStatus, AssetStatus, AssignmentType, HolderType, NotificationType, RequestType } from '@common/enums';

// mock query ของ RequisitionsService.findItAdminIds() — คืนพนักงาน role it_admin ตาม id ที่ส่งมา
function itAdminQueryBuilder(adminIds: number[]) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(adminIds.map((employeeId) => ({ employeeId }))),
  };
}

describe('RequisitionsService#findOne (ownership scoping)', () => {
  const buildService = (requisition: any) => {
    const repo = { findOne: jest.fn().mockResolvedValue(requisition) } as any;
    const itemRepo = {} as any;
    const approvalRepo = {} as any;
    const dataSource = {} as any;
    const notifications = { notify: jest.fn() } as any;
    const attachments = {} as any;
    const assignments = {} as any;
    return new RequisitionsService(
      repo,
      itemRepo,
      approvalRepo,
      {} as any,
      {} as any,
      dataSource,
      notifications,
      attachments,
      assignments,
    );
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

  it('allows an assigned approver without requisition.view_all', async () => {
    const service = buildService({
      requisitionId: 1,
      requestedBy: 10,
      approvals: [{ approverId: 42, approvalLevel: 1 }],
    });
    await expect(
      service.findOne(1, { employeeId: 42, permissions: [] }),
    ).resolves.toEqual(expect.objectContaining({ requisitionId: 1 }));
  });

  it('rejects an employee who is neither owner, view_all, nor an assigned approver', async () => {
    const service = buildService({
      requisitionId: 1,
      requestedBy: 10,
      approvals: [{ approverId: 42, approvalLevel: 1 }],
    });
    await expect(service.findOne(1, { employeeId: 99, permissions: [] })).rejects.toThrow(ForbiddenException);
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
    const assignments = {} as any;
    const service = new RequisitionsService(
      repo,
      itemRepo,
      approvalRepo,
      {} as any,
      {} as any,
      dataSource,
      notifications,
      attachments,
      assignments,
    );
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

describe('RequisitionsService#create (on behalf of)', () => {
  function buildService(employee: any, assetRepoOverride?: any) {
    const repo = {} as any;
    const itemRepo = {} as any;
    const approvalRepo = {} as any;
    const employeeRepo = {
      findOne: jest.fn().mockResolvedValue(employee),
      createQueryBuilder: jest.fn(() => itAdminQueryBuilder([5])),
    } as any;
    const assetRepo = assetRepoOverride ?? ({} as any);
    const dataSource = { transaction: jest.fn() } as any;
    const notifications = { notify: jest.fn() } as any;
    const attachments = {} as any;
    const assignments = {} as any;
    const service = new RequisitionsService(
      repo,
      itemRepo,
      approvalRepo,
      employeeRepo,
      assetRepo,
      dataSource,
      notifications,
      attachments,
      assignments,
    );
    return { service, dataSource, employeeRepo, assetRepo };
  }

  const baseDto = {
    requestType: RequestType.WITHDRAW,
    items: [{ assetId: 1, quantity: 1 }],
    approverIds: [5],
  } as any;

  it('rejects onBehalfOfEmployeeId without requisition.create_on_behalf, before touching the transaction', async () => {
    const { service, dataSource } = buildService({ employeeId: 20 });
    await expect(
      service.create({ ...baseDto, onBehalfOfEmployeeId: 20 }, { employeeId: 10, permissions: [] }),
    ).rejects.toThrow(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects onBehalfOfEmployeeId for a role that can view all requisitions but not request on behalf', async () => {
    const { service, dataSource } = buildService({ employeeId: 20 });
    await expect(
      service.create({ ...baseDto, onBehalfOfEmployeeId: 20 }, { employeeId: 10, permissions: ['requisition.view_all'] }),
    ).rejects.toThrow(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-existent onBehalfOfEmployeeId even with requisition.create_on_behalf', async () => {
    const { service } = buildService(null);
    await expect(
      service.create(
        { ...baseDto, onBehalfOfEmployeeId: 999 },
        { employeeId: 10, permissions: ['requisition.create_on_behalf'] },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects the same serialized asset being picked twice in one requisition', async () => {
    const { service } = buildService(null);
    const dto = { ...baseDto, items: [{ assetId: 1, quantity: 1 }, { assetId: 1, quantity: 1 }] };
    await expect(service.create(dto, { employeeId: 10, permissions: [] })).rejects.toThrow(BadRequestException);
  });

  it('rejects a requested asset that is no longer in_stock (already issued to someone else)', async () => {
    const assetRepo = { find: jest.fn().mockResolvedValue([{ assetId: 1, assetName: 'Notebook', serialNumber: 'SN1', currentStatus: 'assigned' }]) } as any;
    const { service } = buildService(null, assetRepo);
    await expect(service.create(baseDto, { employeeId: 10, permissions: [] })).rejects.toThrow(ConflictException);
  });

  it('rejects a requested assetId that no longer exists', async () => {
    const assetRepo = { find: jest.fn().mockResolvedValue([]) } as any;
    const { service } = buildService(null, assetRepo);
    await expect(service.create(baseDto, { employeeId: 10, permissions: [] })).rejects.toThrow(NotFoundException);
  });

  const hrOnlyNotebook = {
    assetId: 1,
    assetName: 'Notebook',
    serialNumber: 'SN1',
    currentStatus: 'in_stock',
    category: { categoryName: 'Notebook', requiresHrRequest: false, parent: { requiresHrRequest: true } },
  };

  it('rejects an HR-only category (incl. via parent) for an employee without requisition.create_on_behalf', async () => {
    const assetRepo = { find: jest.fn().mockResolvedValue([hrOnlyNotebook]) } as any;
    const { service, dataSource } = buildService(null, assetRepo);
    await expect(service.create(baseDto, { employeeId: 10, permissions: [] })).rejects.toThrow(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('lets HR request an HR-only category for themselves', async () => {
    const assetRepo = { find: jest.fn().mockResolvedValue([hrOnlyNotebook]) } as any;
    const { service } = buildService({ employeeId: 10 }, assetRepo);
    // ผ่านด่าน HR-only ไปถึง transaction ได้ — mock transaction ว่างจึง reject ด้วยเหตุอื่น ไม่ใช่ Forbidden
    await expect(
      service.create(baseDto, { employeeId: 10, permissions: ['requisition.create_on_behalf'] }),
    ).rejects.not.toThrow(ForbiddenException);
  });
});

describe('RequisitionsService#create (documentInfo snapshot)', () => {
  const requester = {
    employeeId: 10,
    fullName: 'สมชาย ใจดี',
    employeeCode: 'EMP-010',
    position: 'IT Support',
    phone: '0812345678',
    department: { departmentName: 'IT' },
  };

  function buildService() {
    const savedRequisitions: any[] = [];
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (data) => {
        if (Array.isArray(data)) return data;
        if (!('requisitionId' in data)) {
          data.requisitionId = 1;
          savedRequisitions.push(data);
        }
        return data;
      }),
      findOne: jest.fn().mockImplementation(() => Promise.resolve({ requisitionId: 1, requisitionNo: 'Req-Equipment-1' })),
    };
    const repo = {} as any;
    const itemRepo = {} as any;
    const approvalRepo = {} as any;
    const employeeRepo = {
      findOne: jest.fn().mockResolvedValue(requester),
      createQueryBuilder: jest.fn(() => itAdminQueryBuilder([5])),
    } as any;
    const assetRepo = {
      find: jest.fn().mockResolvedValue([{ assetId: 1, assetName: 'Notebook', serialNumber: 'SN1', currentStatus: AssetStatus.IN_STOCK }]),
    } as any;
    const dataSource = { transaction: jest.fn((cb) => cb(manager)) } as any;
    const notifications = { notify: jest.fn() } as any;
    const attachments = {} as any;
    const assignments = {} as any;
    const service = new RequisitionsService(
      repo,
      itemRepo,
      approvalRepo,
      employeeRepo,
      assetRepo,
      dataSource,
      notifications,
      attachments,
      assignments,
    );
    return { service, manager };
  }

  const baseDto = {
    requestType: RequestType.WITHDRAW,
    items: [{ assetId: 1, quantity: 1 }],
    approverIds: [5],
  } as any;

  it('defaults documentInfo fields from the requester employee when not provided', async () => {
    const { service, manager } = buildService();
    await service.create(baseDto, { employeeId: 10, permissions: [] });

    const requisitionArg = manager.create.mock.calls.find(([, data]) => 'documentInfo' in data)![1];
    expect(requisitionArg.documentInfo).toEqual({
      employeeNameEn: null,
      startDate: null,
      position: 'IT Support',
      department: 'IT',
      contactPhone: '0812345678',
      accessories: null,
    });
  });

  it('prefers explicit document fields over the employee defaults', async () => {
    const { service, manager } = buildService();
    await service.create(
      {
        ...baseDto,
        employeeNameEn: 'Somchai Jaidee',
        startDate: '2026-08-03',
        position: 'Senior IT Support',
        department: 'IT Infrastructure',
        contactPhone: '0899999999',
        accessories: { adapter: true, mouse: true, other: 'สายชาร์จ' },
      },
      { employeeId: 10, permissions: [] },
    );

    const requisitionArg = manager.create.mock.calls.find(([, data]) => 'documentInfo' in data)![1];
    expect(requisitionArg.documentInfo).toEqual({
      employeeNameEn: 'Somchai Jaidee',
      startDate: '2026-08-03',
      position: 'Senior IT Support',
      department: 'IT Infrastructure',
      contactPhone: '0899999999',
      accessories: { adapter: true, mouse: true, pen: false, bag: false, other: 'สายชาร์จ' },
    });
  });
});

describe('RequisitionsService#renderDocument', () => {
  it('renders the employee name and requisition number into the HTML document', async () => {
    const requisition = {
      requisitionId: 1,
      requisitionNo: 'Req-Equipment-1',
      requestType: RequestType.WITHDRAW,
      requestedBy: 10,
      createdAt: new Date('2026-08-03'),
      documentInfo: { employeeNameEn: 'Somchai Jaidee', startDate: null, position: 'IT Support', department: 'IT', contactPhone: '0812345678', accessories: null },
      requestedByEmployee: { fullName: 'สมชาย ใจดี', employeeCode: 'EMP-010', department: { departmentName: 'IT' } },
      items: [{ note: 'ใช้งานปกติ', asset: { assetName: 'Notebook', brand: 'Asus', model: 'Expertbook', serialNumber: 'SN1' } }],
      approvals: [],
    };
    const repo = { findOne: jest.fn().mockResolvedValue(requisition) } as any;
    const service = new RequisitionsService(
      repo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { notify: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    const html = await service.renderDocument(1, { employeeId: 10, permissions: [] });
    expect(html).toContain('สมชาย ใจดี');
    expect(html).toContain('Req-Equipment-1');
    expect(html).toContain('Notebook');
    expect(html).toContain('Somchai Jaidee');
  });
});

describe('RequisitionsService#approve (concurrency-safe)', () => {
  function buildService({ requisition, approvals, items = [] }: { requisition: any; approvals: any[]; items?: any[] }) {
    const managerFindOne = jest.fn().mockResolvedValue(requisition);
    const managerFind = jest.fn().mockResolvedValue(approvals);
    const managerSave = jest.fn().mockImplementation((entity: any) => Promise.resolve(entity));
    const manager = { findOne: managerFindOne, find: managerFind, save: managerSave } as any;
    const dataSource = { transaction: jest.fn().mockImplementation((cb: any) => cb(manager)) } as any;
    // ต้อง lazy-evaluate (mockImplementation ไม่ใช่ mockResolvedValue) เพราะ approve() แก้ requisition.overallStatus
    // ในออบเจกต์เดิมก่อนโค้ดจะ refetch ผ่าน repo.findOne — ถ้า spread ตอนสร้าง mock ครั้งเดียวจะได้ค่าเก่าค้างตลอด
    const repo = { findOne: jest.fn().mockImplementation(() => Promise.resolve({ ...requisition, approvals })) } as any;
    const itemRepo = { find: jest.fn().mockResolvedValue(items) } as any;
    const approvalRepo = {} as any;
    const notifications = { notify: jest.fn() } as any;
    const attachments = {} as any;
    const assignments = { issue: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new RequisitionsService(
      repo,
      itemRepo,
      approvalRepo,
      {} as any,
      {} as any,
      dataSource,
      notifications,
      attachments,
      assignments,
    );
    return { service, manager, dataSource, notifications, assignments };
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

  it('auto-issues serialized asset items to the requester once fully approved, but skips stock/consumable items', async () => {
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requisitionNo: 'Req-Equipment-1',
      requestType: RequestType.BORROW,
      dueDate: '2026-09-01',
      overallStatus: ApprovalStatus.PENDING,
    };
    const approvals = [{ requisitionId: 1, approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING }];
    const items = [{ assetId: 42, stockItemId: null }, { assetId: null, stockItemId: 7 }];
    const { service, assignments } = buildService({ requisition, approvals, items });

    await service.approve(1, { status: ApprovalStatus.APPROVED } as any, 5);

    expect(assignments.issue).toHaveBeenCalledTimes(1);
    expect(assignments.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 42,
        requisitionId: 1,
        assignmentType: AssignmentType.TEMPORARY_LOAN,
        holderType: HolderType.EMPLOYEE,
        holderId: 10,
      }),
      5,
    );
  });

  it('issues to the recipient (requestedFor) and notifies them when HR requested on their behalf', async () => {
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requestedFor: 77,
      requisitionNo: 'Req-Equipment-1',
      requestType: RequestType.WITHDRAW,
      dueDate: null,
      overallStatus: ApprovalStatus.PENDING,
    };
    const approvals = [{ requisitionId: 1, approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING }];
    const items = [{ assetId: 42, stockItemId: null }];
    const { service, assignments, notifications } = buildService({ requisition, approvals, items });

    await service.approve(1, { status: ApprovalStatus.APPROVED } as any, 5);

    expect(assignments.issue).toHaveBeenCalledWith(expect.objectContaining({ assetId: 42, holderId: 77 }), 5);
    expect(notifications.notify).toHaveBeenCalledWith(77, NotificationType.REQUISITION_APPROVED, expect.any(String), expect.any(String), 'requisition', 1);
  });

  it('does not auto-issue anything when the requisition is still waiting on another approval level', async () => {
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requisitionNo: 'Req-Equipment-1',
      requestType: RequestType.BORROW,
      overallStatus: ApprovalStatus.PENDING,
    };
    const approvals = [
      { requisitionId: 1, approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING },
      { requisitionId: 1, approvalLevel: 2, approverId: 6, status: ApprovalStatus.PENDING },
    ];
    const items = [{ assetId: 42, stockItemId: null }];
    const { service, assignments } = buildService({ requisition, approvals, items });

    await service.approve(1, { status: ApprovalStatus.APPROVED } as any, 5);

    expect(assignments.issue).not.toHaveBeenCalled();
  });

  it('does not fail the approval when auto-issuing an item throws', async () => {
    const requisition = {
      requisitionId: 1,
      requestedBy: 10,
      requisitionNo: 'Req-Equipment-1',
      requestType: RequestType.WITHDRAW,
      overallStatus: ApprovalStatus.PENDING,
    };
    const approvals = [{ requisitionId: 1, approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING }];
    const items = [{ assetId: 42, stockItemId: null }];
    const { service, assignments } = buildService({ requisition, approvals, items });
    assignments.issue.mockRejectedValue(new Error('asset no longer in stock'));

    await expect(service.approve(1, { status: ApprovalStatus.APPROVED } as any, 5)).resolves.toEqual(
      expect.objectContaining({ requisitionId: 1 }),
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

describe('RequisitionsService#create (new employee not yet in the system)', () => {
  function buildService(existingEmployee: any = null) {
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (data) => {
        if (Array.isArray(data)) return data;
        if ('employeeCode' in data) return { ...data, employeeId: 77 };
        if (!('requisitionId' in data)) data.requisitionId = 1;
        return data;
      }),
      findOne: jest.fn().mockImplementation((_entity, opts) =>
        Promise.resolve(
          opts?.where?.employeeId === 77
            ? { employeeId: 77, fullName: 'พนักงาน ใหม่', position: 'Engineer', department: { departmentName: 'IT' } }
            : { requisitionId: 1, requisitionNo: 'Req-Equipment-1' },
        ),
      ),
    };
    const employeeRepo = {
      findOne: jest.fn().mockResolvedValue(existingEmployee),
      createQueryBuilder: jest.fn(() => itAdminQueryBuilder([5])),
    } as any;
    const assetRepo = {
      find: jest.fn().mockResolvedValue([{ assetId: 1, assetName: 'Notebook', serialNumber: 'SN1', currentStatus: AssetStatus.IN_STOCK }]),
    } as any;
    const dataSource = { transaction: jest.fn((cb) => cb(manager)) } as any;
    const service = new RequisitionsService(
      {} as any,
      {} as any,
      {} as any,
      employeeRepo,
      assetRepo,
      dataSource,
      { notify: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    return { service, manager, dataSource };
  }

  const baseDto = {
    requestType: RequestType.WITHDRAW,
    items: [{ assetId: 1, quantity: 1 }],
    approverIds: [5],
    newEmployee: { employeeCode: ' EMP-0099 ', fullName: ' พนักงาน ใหม่ ', position: 'Engineer', email: 'New.Hire@MillimedThailand.com' },
  } as any;
  const hr = { employeeId: 10, permissions: ['requisition.create_on_behalf'] };

  it('creates the employee inside the transaction as the recipient, keeping HR as the requester', async () => {
    const { service, manager } = buildService();

    await service.create(baseDto, hr);

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ employeeCode: 'EMP-0099', fullName: 'พนักงาน ใหม่', email: 'new.hire@millimedthailand.com' }),
    );
    const requisitionArg = manager.create.mock.calls.find(([, data]) => 'documentInfo' in data)![1];
    expect(requisitionArg.requestedBy).toBe(hr.employeeId);
    expect(requisitionArg.requestedFor).toBe(77);
    expect(requisitionArg.documentInfo).toEqual(expect.objectContaining({ position: 'Engineer', department: 'IT' }));
  });

  it('rejects without requisition.create_on_behalf, before touching the transaction', async () => {
    const { service, dataSource } = buildService();
    await expect(service.create(baseDto, { employeeId: 10, permissions: [] })).rejects.toThrow(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects an employeeCode that already exists', async () => {
    const { service } = buildService({ employeeId: 3, employeeCode: 'EMP-0099' });
    await expect(service.create(baseDto, hr)).rejects.toThrow(ConflictException);
  });

  it('rejects sending both newEmployee and onBehalfOfEmployeeId', async () => {
    const { service } = buildService();
    await expect(service.create({ ...baseDto, onBehalfOfEmployeeId: 20 }, hr)).rejects.toThrow(BadRequestException);
  });
});

describe('RequisitionsService#create (approver = it_admin)', () => {
  function buildService(adminIds: number[], employee: any = { employeeId: 10, fullName: 'สมชาย ใจดี' }) {
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (data) => {
        if (!Array.isArray(data) && 'documentInfo' in data) data.requisitionId = 1;
        return data;
      }),
      findOne: jest.fn().mockResolvedValue({ requisitionId: 1, requisitionNo: 'Req-Equipment-1', requestedBy: 10, requestedFor: null }),
    };
    const repo = { findOne: jest.fn().mockResolvedValue({ requisitionId: 1, overallStatus: ApprovalStatus.APPROVED }) } as any;
    const itemRepo = { find: jest.fn().mockResolvedValue([{ assetId: 1 }]) } as any;
    const employeeRepo = {
      findOne: jest.fn().mockResolvedValue(employee),
      createQueryBuilder: jest.fn(() => itAdminQueryBuilder(adminIds)),
    } as any;
    const assetRepo = {
      find: jest.fn().mockResolvedValue([{ assetId: 1, assetName: 'Notebook', serialNumber: 'SN1', currentStatus: AssetStatus.IN_STOCK }]),
    } as any;
    const dataSource = { transaction: jest.fn((cb) => cb(manager)) } as any;
    const notifications = { notify: jest.fn() } as any;
    const assignments = { issue: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new RequisitionsService(
      repo,
      itemRepo,
      {} as any,
      employeeRepo,
      assetRepo,
      dataSource,
      notifications,
      {} as any,
      assignments,
    );
    const approvalArgs = () => manager.create.mock.calls.filter(([, data]) => 'approvalLevel' in data).map(([, data]) => data);
    const approvalArg = () => approvalArgs()[0];
    const requisitionArg = () => manager.create.mock.calls.find(([, data]) => 'documentInfo' in data)?.[1];
    return { service, dataSource, notifications, assignments, approvalArg, approvalArgs, requisitionArg };
  }

  const dto = { requestType: RequestType.WITHDRAW, items: [{ assetId: 1, quantity: 1 }] } as any;

  it('uses the chosen it_admin as a pending approver and notifies them', async () => {
    const { service, notifications, assignments, approvalArg, requisitionArg } = buildService([5]);
    await service.create({ ...dto, approverIds: [5] }, { employeeId: 10, permissions: [] });

    expect(approvalArg()).toEqual(expect.objectContaining({ approvalLevel: 1, approverId: 5, status: ApprovalStatus.PENDING }));
    expect(requisitionArg().overallStatus).toBe(ApprovalStatus.PENDING);
    expect(notifications.notify).toHaveBeenCalledWith(5, NotificationType.REQUISITION_PENDING_APPROVAL, expect.any(String), expect.any(String), 'requisition', 1);
    expect(assignments.issue).not.toHaveBeenCalled();
  });

  it('creates one approval level per chosen it_admin, in order', async () => {
    const { service, approvalArgs } = buildService([5, 6]);
    await service.create({ ...dto, approverIds: [6, 5] }, { employeeId: 10, permissions: [] });

    expect(approvalArgs().map((a) => [a.approvalLevel, a.approverId])).toEqual([
      [1, 6],
      [2, 5],
    ]);
  });

  it('rejects when no approver is chosen, before touching the transaction', async () => {
    const { service, dataSource } = buildService([5]);
    await expect(service.create(dto, { employeeId: 10, permissions: [] })).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects an approver who is not an it_admin, before touching the transaction', async () => {
    const { service, dataSource } = buildService([5]);
    await expect(service.create({ ...dto, approverIds: [5, 99] }, { employeeId: 10, permissions: [] })).rejects.toThrow(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects the same approver chosen twice', async () => {
    const { service } = buildService([5]);
    await expect(service.create({ ...dto, approverIds: [5, 5] }, { employeeId: 10, permissions: [] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('auto-approves and issues the assets when the requester is an it_admin, ignoring approverIds', async () => {
    const { service, notifications, assignments, approvalArgs, approvalArg, requisitionArg } = buildService([5, 10]);
    await service.create({ ...dto, approverIds: [5] }, { employeeId: 10, permissions: ['requisition.create_on_behalf'] });

    expect(approvalArgs()).toHaveLength(1);
    expect(approvalArg()).toEqual(expect.objectContaining({ approverId: 10, status: ApprovalStatus.APPROVED, actionedAt: expect.any(Date) }));
    expect(requisitionArg().overallStatus).toBe(ApprovalStatus.APPROVED);
    expect(assignments.issue).toHaveBeenCalledWith(expect.objectContaining({ assetId: 1, holderId: 10 }), 10);
    expect(notifications.notify).not.toHaveBeenCalledWith(expect.anything(), NotificationType.REQUISITION_PENDING_APPROVAL, expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });

  it('auto-approves when HR requests on behalf of an it_admin recipient', async () => {
    const { service, approvalArg, requisitionArg } = buildService([20], { employeeId: 20, fullName: 'แอดมิน ไอที' });
    await service.create(
      { ...dto, onBehalfOfEmployeeId: 20 },
      { employeeId: 10, permissions: ['requisition.create_on_behalf'] },
    );

    expect(approvalArg()).toEqual(expect.objectContaining({ approverId: 20, status: ApprovalStatus.APPROVED }));
    expect(requisitionArg().overallStatus).toBe(ApprovalStatus.APPROVED);
  });
});
