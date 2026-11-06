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

describe('NotificationsService#streamFor (live changes)', () => {
  const service = new NotificationsService({} as any, {} as any, { send: jest.fn() } as any);

  function collect(employeeId: number, permissions: string[]) {
    const received: any[] = [];
    const sub = service.streamFor(employeeId, permissions).subscribe((e) => received.push(e));
    return { received, sub };
  }

  it('delivers a change as a named "change" SSE event to holders of the audience permission', () => {
    const admin = collect(1, ['ticket.view_all', 'ticket.manage']);
    const employee = collect(7, ['ticket.view_own']);

    service.publishChange({ topic: 'support_ticket', action: 'created', id: 5, audience: { permission: 'ticket.view_all' } });

    expect(admin.received).toEqual([{ type: 'change', data: { topic: 'support_ticket', action: 'created', id: 5 } }]);
    expect(employee.received).toEqual([]);
    admin.sub.unsubscribe();
    employee.sub.unsubscribe();
  });

  it('delivers to explicitly listed employees even without the permission (ticket reporter)', () => {
    const reporter = collect(7, ['ticket.view_own']);
    const other = collect(8, ['ticket.view_own']);

    service.publishChange({ topic: 'support_ticket', action: 'updated', id: 5, audience: { permission: 'ticket.view_all', employeeIds: [7] } });

    expect(reporter.received).toHaveLength(1);
    expect(other.received).toEqual([]);
    reporter.sub.unsubscribe();
    other.sub.unsubscribe();
  });
});

