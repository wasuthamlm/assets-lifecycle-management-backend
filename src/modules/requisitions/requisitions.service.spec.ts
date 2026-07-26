import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';

describe('RequisitionsService#findOne (ownership scoping)', () => {
  const buildService = (requisition: any) => {
    const repo = { findOne: jest.fn().mockResolvedValue(requisition) } as any;
    const itemRepo = {} as any;
    const approvalRepo = {} as any;
    const dataSource = {} as any;
    return new RequisitionsService(repo, itemRepo, approvalRepo, dataSource);
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
