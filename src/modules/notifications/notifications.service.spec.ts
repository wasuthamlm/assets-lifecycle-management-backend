import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationType } from '@common/enums';

describe('NotificationsService', () => {
  const mailService = { send: jest.fn().mockResolvedValue(undefined) } as any;

  it('notify() persists a row scoped to the given recipient and best-effort emails them', async () => {
    const repo = {
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ notificationId: 1, ...v })),
    } as any;
    const employeeRepo = { findOne: jest.fn().mockResolvedValue({ employeeId: 10, email: 'somchai@millimed.local' }) } as any;
    const service = new NotificationsService(repo, employeeRepo, mailService);

    const result = await service.notify(
      10,
      NotificationType.REQUISITION_PENDING_APPROVAL,
      'title',
      'message',
      'requisition',
      99,
    );

    expect(result).toEqual(expect.objectContaining({ recipientEmployeeId: 10, referenceId: 99 }));
    expect(mailService.send).toHaveBeenCalledWith('somchai@millimed.local', 'title', 'message');
  });

  it('notify() swallows a repo failure and returns null instead of throwing', async () => {
    const repo = {
      create: jest.fn((v) => v),
      save: jest.fn().mockRejectedValue(new Error('connection reset')),
    } as any;
    const employeeRepo = { findOne: jest.fn() } as any;
    const service = new NotificationsService(repo, employeeRepo, mailService);

    const result = await service.notify(10, NotificationType.REQUISITION_PENDING_APPROVAL, 'title', 'message');
    expect(result).toBeNull();
  });

  it('markRead rejects a notification that does not belong to the caller', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue({ notificationId: 1, recipientEmployeeId: 10 }) } as any;
    const employeeRepo = {} as any;
    const service = new NotificationsService(repo, employeeRepo, mailService);

    await expect(service.markRead(1, 99)).rejects.toThrow(ForbiddenException);
  });

  it('markRead throws NotFoundException when the notification does not exist', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) } as any;
    const employeeRepo = {} as any;
    const service = new NotificationsService(repo, employeeRepo, mailService);

    await expect(service.markRead(1, 10)).rejects.toThrow(NotFoundException);
  });

  it('markRead succeeds for the owning recipient', async () => {
    const notification = { notificationId: 1, recipientEmployeeId: 10, isRead: false };
    const repo = {
      findOne: jest.fn().mockResolvedValue(notification),
      save: jest.fn((v) => Promise.resolve(v)),
    } as any;
    const employeeRepo = {} as any;
    const service = new NotificationsService(repo, employeeRepo, mailService);

    const result = await service.markRead(1, 10);
    expect(result.isRead).toBe(true);
  });

  it('dismiss rejects a notification that does not belong to the caller', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue({ notificationId: 1, recipientEmployeeId: 10 }) } as any;
    const employeeRepo = {} as any;
    const service = new NotificationsService(repo, employeeRepo, mailService);

    await expect(service.dismiss(1, 99)).rejects.toThrow(ForbiddenException);
  });

  it('dismiss sets dismissedAt without deleting the row', async () => {
    const notification = { notificationId: 1, recipientEmployeeId: 10, dismissedAt: null };
    const repo = {
      findOne: jest.fn().mockResolvedValue(notification),
      save: jest.fn((v) => Promise.resolve(v)),
    } as any;
    const employeeRepo = {} as any;
    const service = new NotificationsService(repo, employeeRepo, mailService);

    const result = await service.dismiss(1, 10);
    expect(result.dismissedAt).toBeInstanceOf(Date);
    expect(repo.save).toHaveBeenCalled();
  });

  it('dismissAll only clears the caller\'s own not-yet-dismissed notifications', async () => {
    const repo = { update: jest.fn().mockResolvedValue(undefined) } as any;
    const employeeRepo = {} as any;
    const service = new NotificationsService(repo, employeeRepo, mailService);

    await service.dismissAll(10);
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmployeeId: 10 }),
      expect.objectContaining({ dismissedAt: expect.any(Date) }),
    );
  });
});
