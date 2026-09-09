import { NotificationsCron } from './warranty-expiry.cron';
import { NotificationType } from '@common/enums';

describe('NotificationsCron#notifyOverdueAssignments (it_admin escalation)', () => {
  function buildCron({
    overdue,
    itAdmins,
    alreadyNotifiedToday = jest.fn().mockResolvedValue(false),
    holder = { employeeId: 10, fullName: 'สมชาย ใจดี' },
  }: {
    overdue: any[];
    itAdmins: any[];
    alreadyNotifiedToday?: jest.Mock;
    holder?: any;
  }) {
    const assignmentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(overdue),
      }),
    } as any;
    const employeeRepo = { findOne: jest.fn().mockResolvedValue(holder) } as any;
    const employeeRoleRepo = { find: jest.fn().mockResolvedValue(itAdmins) } as any;
    const notifications = { notify: jest.fn().mockResolvedValue(undefined), alreadyNotifiedToday } as any;
    const cron = new NotificationsCron({} as any, assignmentRepo, employeeRepo, employeeRoleRepo, notifications);
    return { cron, notifications, employeeRepo };
  }

  it('notifies the borrower plus every it_admin when nothing was notified today', async () => {
    const overdue = [{ assignmentId: 1, holderId: 10, assetId: 5, dueDate: '2026-01-01', asset: { assetNo: 'A-1' } }];
    const itAdmins = [{ employeeId: 20 }, { employeeId: 21 }];
    const { cron, notifications } = buildCron({ overdue, itAdmins });

    await cron.notifyOverdueAssignments();

    expect(notifications.notify).toHaveBeenCalledTimes(3);
    expect(notifications.notify).toHaveBeenCalledWith(
      10, NotificationType.ASSIGNMENT_OVERDUE, expect.any(String), expect.any(String), 'assignment', 1,
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      20, NotificationType.ASSIGNMENT_OVERDUE, expect.any(String), expect.any(String), 'assignment', 1,
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      21, NotificationType.ASSIGNMENT_OVERDUE, expect.any(String), expect.any(String), 'assignment', 1,
    );
  });

  it('skips an admin who was already notified today but still notifies the other admin', async () => {
    const overdue = [{ assignmentId: 1, holderId: 10, assetId: 5, dueDate: '2026-01-01', asset: { assetNo: 'A-1' } }];
    const itAdmins = [{ employeeId: 20 }, { employeeId: 21 }];
    const alreadyNotifiedToday = jest.fn().mockImplementation((employeeId: number) =>
      Promise.resolve(employeeId === 20),
    );
    const { cron, notifications } = buildCron({ overdue, itAdmins, alreadyNotifiedToday });

    await cron.notifyOverdueAssignments();

    expect(notifications.notify).not.toHaveBeenCalledWith(
      20, NotificationType.ASSIGNMENT_OVERDUE, expect.anything(), expect.anything(), 'assignment', 1,
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      21, NotificationType.ASSIGNMENT_OVERDUE, expect.any(String), expect.any(String), 'assignment', 1,
    );
  });

  it("includes the holder's name in the admin-facing message", async () => {
    const overdue = [{ assignmentId: 1, holderId: 10, assetId: 5, dueDate: '2026-01-01', asset: { assetNo: 'A-1' } }];
    const itAdmins = [{ employeeId: 20 }];
    const { cron, notifications } = buildCron({
      overdue, itAdmins, holder: { employeeId: 10, fullName: 'สมชาย ใจดี' },
    });

    await cron.notifyOverdueAssignments();

    expect(notifications.notify).toHaveBeenCalledWith(
      20, NotificationType.ASSIGNMENT_OVERDUE, expect.any(String), expect.stringContaining('สมชาย ใจดี'), 'assignment', 1,
    );
  });

  it('still notifies the borrower when there are no it_admins', async () => {
    const overdue = [{ assignmentId: 1, holderId: 10, assetId: 5, dueDate: '2026-01-01', asset: { assetNo: 'A-1' } }];
    const { cron, notifications } = buildCron({ overdue, itAdmins: [] });

    await cron.notifyOverdueAssignments();

    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      10, NotificationType.ASSIGNMENT_OVERDUE, expect.any(String), expect.any(String), 'assignment', 1,
    );
  });

  it('still notifies admins even when the borrower was already notified today', async () => {
    const overdue = [{ assignmentId: 1, holderId: 10, assetId: 5, dueDate: '2026-01-01', asset: { assetNo: 'A-1' } }];
    const itAdmins = [{ employeeId: 20 }];
    const alreadyNotifiedToday = jest.fn().mockImplementation((employeeId: number) =>
      Promise.resolve(employeeId === 10),
    );
    const { cron, notifications } = buildCron({ overdue, itAdmins, alreadyNotifiedToday });

    await cron.notifyOverdueAssignments();

    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      20, NotificationType.ASSIGNMENT_OVERDUE, expect.any(String), expect.any(String), 'assignment', 1,
    );
  });
});
