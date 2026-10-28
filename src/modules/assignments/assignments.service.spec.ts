import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { Assignment } from './entities/assignment.entity';
import { Asset } from '../assets/entities/asset.entity';
import { AssetStatus, HolderType, NotificationType, ReturnCondition } from '@common/enums';

describe('AssignmentsService#return_ (late-return flag)', () => {
  function buildService(assignment: any, asset: any = { assetId: 1, currentStatus: AssetStatus.ASSIGNED }) {
    const managerSave = jest.fn().mockImplementation((entity: any) => Promise.resolve(entity));
    const managerFindOne = jest.fn().mockImplementation((entity: any) => {
      if (entity === Assignment) return Promise.resolve(assignment);
      if (entity === Asset) return Promise.resolve(asset);
      return Promise.resolve(null);
    });
    const manager = { findOne: managerFindOne, save: managerSave } as any;
    const dataSource = { transaction: jest.fn().mockImplementation((cb: any) => cb(manager)) } as any;
    const movementsService = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const notifications = { notify: jest.fn().mockResolvedValue(null) } as any;
    const service = new AssignmentsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      movementsService,
      notifications,
      dataSource,
    );
    return { service, manager, movementsService, notifications };
  }

  it('marks isLateReturn=true when returned after dueDate', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const assignment = { assignmentId: 1, assetId: 1, dueDate: yesterday, returnedDate: null };
    const { service, manager, movementsService } = buildService(assignment);

    await service.return_(1, { returnCondition: ReturnCondition.NORMAL } as any, 99);

    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ isLateReturn: true }));
    expect(movementsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.stringContaining('คืนล่าช้ากว่ากำหนด') }),
      manager,
    );
  });

  it('marks isLateReturn=false when returned before dueDate', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const assignment = { assignmentId: 1, assetId: 1, dueDate: tomorrow, returnedDate: null };
    const { service, manager, movementsService } = buildService(assignment);

    await service.return_(1, { returnCondition: ReturnCondition.NORMAL } as any, 99);

    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ isLateReturn: false }));
    expect(movementsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.not.stringContaining('คืนล่าช้ากว่ากำหนด') }),
      manager,
    );
  });

  it('marks isLateReturn=false for a permanent assignment with no dueDate', async () => {
    const assignment = { assignmentId: 1, assetId: 1, dueDate: null, returnedDate: null };
    const { service, manager } = buildService(assignment);

    await service.return_(1, { returnCondition: ReturnCondition.NORMAL } as any, 99);

    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ isLateReturn: false }));
  });

  it('still throws BadRequestException on a double-return', async () => {
    const assignment = { assignmentId: 1, assetId: 1, dueDate: null, returnedDate: new Date() };
    const { service } = buildService(assignment);

    await expect(service.return_(1, { returnCondition: ReturnCondition.NORMAL } as any, 99)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('still throws NotFoundException when the assignment does not exist', async () => {
    const { service } = buildService(null);
    await expect(service.return_(1, { returnCondition: ReturnCondition.NORMAL } as any, 99)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('notifies the employee holder that the return was recorded', async () => {
    const assignment = { assignmentId: 7, assetId: 1, holderType: HolderType.EMPLOYEE, holderId: 42, dueDate: null, returnedDate: null };
    const { service, notifications } = buildService(assignment, { assetId: 1, assetNo: 'A-001', assetName: 'Laptop' });

    await service.return_(7, { returnCondition: ReturnCondition.NORMAL }, 99);

    expect(notifications.notify).toHaveBeenCalledWith(
      42,
      NotificationType.ASSIGNMENT_RETURNED,
      expect.any(String),
      expect.stringContaining('A-001'),
      'assignment',
      7,
    );
  });

  it('does not notify when the holder recorded their own return', async () => {
    const assignment = { assignmentId: 7, assetId: 1, holderType: HolderType.EMPLOYEE, holderId: 42, dueDate: null, returnedDate: null };
    const { service, notifications } = buildService(assignment);

    await service.return_(7, { returnCondition: ReturnCondition.NORMAL }, 42);

    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
