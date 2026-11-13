import { ConflictException } from '@nestjs/common';
import { ApprovalStatus, AssetStatus, RequestType, TicketSource } from '@common/enums';
import { LineBorrowService, bangkokToday } from './line-borrow.service';

const qb = (result: { getMany?: any[]; getOne?: any; getRawMany?: any[] }) => {
  const b: any = {};
  for (const m of ['innerJoin', 'leftJoin', 'select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'orderBy']) {
    b[m] = jest.fn().mockReturnValue(b);
  }
  b.getMany = jest.fn().mockResolvedValue(result.getMany ?? []);
  b.getOne = jest.fn().mockResolvedValue(result.getOne ?? null);
  b.getRawMany = jest.fn().mockResolvedValue(result.getRawMany ?? []);
  return b;
};

const laptopCategory = { categoryId: 2, categoryName: 'Notebook', requiresHrRequest: true, parent: null };
const mouseCategory = { categoryId: 3, categoryName: 'Mouse', requiresHrRequest: false, parent: null };
const mouse = { assetId: 11, assetNo: 'AS-0011', assetName: 'Logitech M331', categoryId: 3, category: mouseCategory, currentStatus: AssetStatus.IN_STOCK };

const employee = { employeeId: 7, permissions: ['requisition.create'], roles: ['employee'] };
const json = (messages: any[]) => JSON.stringify(messages);

function build(opts: { asset?: any; admins?: any[]; existing?: any; raw?: any[] } = {}) {
  const assets = {
    findOne: jest.fn().mockResolvedValue(opts.asset === undefined ? mouse : opts.asset),
    find: jest.fn().mockResolvedValue([mouse]),
    createQueryBuilder: jest.fn(() => qb({ getRawMany: opts.raw ?? [] })),
  } as any;
  const employees = {
    createQueryBuilder: jest.fn(() => qb({ getMany: opts.admins ?? [{ employeeId: 1, fullName: 'แอดมิน หนึ่ง' }, { employeeId: 2, fullName: 'แอดมิน สอง' }] })),
  } as any;
  const requisitionRepo = { createQueryBuilder: jest.fn(() => qb({ getOne: opts.existing ?? null })) } as any;
  const requisitions = {
    create: jest.fn().mockResolvedValue({ requisitionId: 99, requisitionNo: 'RQ-6911-0001', overallStatus: ApprovalStatus.PENDING }),
  } as any;
  const attachments = {
    find: jest.fn().mockResolvedValue([
      { referenceId: 11, fileUrl: 'asset/11/a.jpg', mimeType: 'image/jpeg' },
      { referenceId: 11, fileUrl: 'asset/11/b.jpg', mimeType: 'image/jpeg' },
    ]),
  } as any;
  const storage = { createSignedUrl: jest.fn(async (path: string) => `https://storage.example.com/${path}?token=x`) } as any;
  return {
    service: new LineBorrowService(requisitions, assets, employees, requisitionRepo, attachments, storage),
    requisitions,
    storage,
    assets,
  };
}

const p = (s: string) => new URLSearchParams(s);
const tomorrow = bangkokToday(new Date(), 1);

describe('LineBorrowService', () => {
  it('refuses users without requisition.create', async () => {
    const { service } = build();
    const out = await service.handle({ ...employee, permissions: [] }, p('a=menu'));
    expect(json(out)).toContain('ไม่มีสิทธิ์');
  });

  it('hides HR-only categories from regular employees', async () => {
    const raw = [
      { categoryId: 2, name: 'Notebook', hrOnly: true, count: '3' },
      { categoryId: 3, name: 'Mouse', hrOnly: false, count: '5' },
    ];
    const out = json(await build({ raw }).service.handle(employee, p('a=menu')));
    expect(out).toContain('a=bc&c=3');
    expect(out).not.toContain('a=bc&c=2');
    expect(out).toContain('HR');
  });

  it('asset cards show the first photo and no asset code / serial number', async () => {
    const { service, storage } = build();
    const out = json(await service.handle(employee, p('a=bc&c=3')));
    expect(out).toContain('https://storage.example.com/asset/11/a.jpg');
    expect(out).not.toContain('b.jpg');
    expect(out).not.toContain('AS-0011');
    expect(out).not.toContain('S/N');
    // signed URL อายุยาวพอให้เปิดดูการ์ดทีหลังได้
    expect(storage.createSignedUrl).toHaveBeenCalledWith('asset/11/a.jpg', 7 * 24 * 3600);
  });

  it('a broken image lookup never blocks borrowing', async () => {
    const { service, storage } = build();
    storage.createSignedUrl.mockRejectedValue(new Error('storage down'));
    const out = json(await service.handle(employee, p('a=ba&as=11')));
    expect(out).toContain('ยืม');
    expect(out).not.toContain('storage.example.com');
  });

  it('re-checks the asset on every step (no longer in stock / HR-only)', async () => {
    const taken = build({ asset: { ...mouse, currentStatus: AssetStatus.ASSIGNED } });
    expect(json(await taken.service.handle(employee, p('a=ba&as=11')))).toContain('ไม่ว่างแล้ว');

    const hrOnly = build({ asset: { ...mouse, category: laptopCategory } });
    expect(json(await hrOnly.service.handle(employee, p('a=ba&as=11')))).toContain('HR');
  });

  it('borrow needs a future return date', async () => {
    const { service } = build();
    expect(json(await service.handle(employee, p(`a=bt&as=11&t=b&date=${bangkokToday()}`)))).toContain('วันพรุ่งนี้');
    // วันที่ถูกต้อง → ไปขั้นเลือกผู้อนุมัติ พร้อมพกวันคืนไปใน data
    expect(json(await service.handle(employee, p(`a=bt&as=11&t=b&date=${tomorrow}`)))).toContain(`a=bp&as=11&t=b&d=${tomorrow}&ap=1`);
  });

  it('skips the approver step when there is only one IT admin', async () => {
    const { service } = build({ admins: [{ employeeId: 1, fullName: 'แอดมิน หนึ่ง' }] });
    expect(json(await service.handle(employee, p('a=bt&as=11&t=w')))).toContain('a=bs&as=11&t=w&ap=1');
  });

  it('rejects an approver who is not an IT admin (tampered postback)', async () => {
    const { service, requisitions } = build();
    const out = await service.handle(employee, p('a=bs&as=11&t=w&ap=555'));
    expect(json(out)).toContain('ผู้อนุมัติไม่ถูกต้อง');
    expect(requisitions.create).not.toHaveBeenCalled();
  });

  it('submits through RequisitionsService with the user’s own permissions', async () => {
    const { service, requisitions } = build();
    const out = await service.handle(employee, p(`a=bs&as=11&t=b&d=${tomorrow}&ap=2`));
    expect(requisitions.create).toHaveBeenCalledWith(
      expect.objectContaining({ requestType: RequestType.BORROW, dueDate: tomorrow, items: [{ assetId: 11, quantity: 1 }], approverIds: [2] }),
      { employeeId: 7, permissions: ['requisition.create'] },
      { source: TicketSource.LINE },
    );
    expect(json(out)).toContain('RQ-6911-0001');
  });

  it('does not create a duplicate when confirm is tapped twice', async () => {
    const { service, requisitions } = build({ existing: { requisitionNo: 'RQ-6911-0001' } });
    const out = await service.handle(employee, p('a=bs&as=11&t=w&ap=1'));
    expect(requisitions.create).not.toHaveBeenCalled();
    expect(json(out)).toContain('ส่งคำขอเครื่องนี้ไว้แล้ว');
  });

  it('shows business-rule errors from RequisitionsService to the user', async () => {
    const { service, requisitions } = build();
    requisitions.create.mockRejectedValue(new ConflictException('ถูกเบิกไปแล้ว'));
    expect(json(await service.handle(employee, p('a=bs&as=11&t=w&ap=1')))).toContain('ถูกเบิกไปแล้ว');
  });

  it('it_admin requests are auto-approved — no approver needed', async () => {
    const { service, requisitions } = build();
    await service.handle({ ...employee, roles: ['it_admin'] }, p('a=bs&as=11&t=w'));
    expect(requisitions.create).toHaveBeenCalledWith(expect.objectContaining({ approverIds: undefined }), expect.anything(), { source: TicketSource.LINE });
  });
});
