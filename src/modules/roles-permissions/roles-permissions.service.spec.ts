import { ConflictException, NotFoundException } from '@nestjs/common';
import { RolesPermissionsService } from './roles-permissions.service';

/** mock ของ manager.createQueryBuilder(...).innerJoin(...).innerJoin(...).where(...).select(...).getRawOne() */
function mockQueryBuilder(rbacAdminCount: number) {
  const qb: any = {};
  qb.innerJoin = jest.fn(() => qb);
  qb.where = jest.fn(() => qb);
  qb.select = jest.fn(() => qb);
  qb.getRawOne = jest.fn().mockResolvedValue({ cnt: String(rbacAdminCount) });
  return qb;
}

describe('RolesPermissionsService', () => {
  let permissionCache: any;
  beforeEach(() => {
    permissionCache = { invalidateEmployee: jest.fn(), clear: jest.fn() };
  });

  describe('assignRolesToEmployee', () => {
    it('rejects when the employee does not exist', async () => {
      const employeeRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
      const notificationsService = { notify: jest.fn() } as any;
      const service = new RolesPermissionsService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        employeeRepo,
        {} as any,
        notificationsService,
        permissionCache,
      );

      await expect(service.assignRolesToEmployee(1, { roleIds: [1] })).rejects.toThrow(NotFoundException);
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('replaces the employee_roles rows and notifies the employee that their permissions changed', async () => {
      const employee = { employeeId: 5, fullName: 'สมชาย ใจดี' };
      const employeeRepo = { findOne: jest.fn().mockResolvedValue(employee) } as any;
      const roleRepo = { find: jest.fn().mockResolvedValue([{ roleId: 2 }]) } as any;
      const manager = {
        delete: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_entity, v) => v),
        save: jest.fn().mockResolvedValue([{ employeeId: 5, roleId: 2 }]),
        createQueryBuilder: jest.fn(() => mockQueryBuilder(1)),
      };
      const dataSource = { transaction: jest.fn((cb) => cb(manager)) } as any;
      const notificationsService = { notify: jest.fn().mockResolvedValue(null) } as any;
      const service = new RolesPermissionsService(
        roleRepo,
        {} as any,
        {} as any,
        {} as any,
        employeeRepo,
        dataSource,
        notificationsService,
        permissionCache,
      );

      await service.assignRolesToEmployee(5, { roleIds: [2] });

      // ล้างแคชก่อนแจ้ง ไม่งั้น frontend refetch /auth/me แล้วได้สิทธิ์เดิมกลับมา
      expect(permissionCache.invalidateEmployee).toHaveBeenCalledWith(5);
      expect(permissionCache.invalidateEmployee.mock.invocationCallOrder[0]).toBeLessThan(
        notificationsService.notify.mock.invocationCallOrder[0],
      );
      expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { employeeId: 5 });
      expect(notificationsService.notify).toHaveBeenCalledWith(
        5,
        'permissions_updated',
        expect.any(String),
        expect.stringContaining('สมชาย ใจดี'),
        'employee',
        5,
      );
    });

    it('rejects (and does not notify) when the change would leave no one holding rbac.manage', async () => {
      const employee = { employeeId: 5, fullName: 'สมชาย ใจดี' };
      const employeeRepo = { findOne: jest.fn().mockResolvedValue(employee) } as any;
      const roleRepo = { find: jest.fn().mockResolvedValue([{ roleId: 2 }]) } as any;
      const manager = {
        delete: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_entity, v) => v),
        save: jest.fn().mockResolvedValue([{ employeeId: 5, roleId: 2 }]),
        createQueryBuilder: jest.fn(() => mockQueryBuilder(0)),
      };
      const dataSource = { transaction: jest.fn((cb) => cb(manager)) } as any;
      const notificationsService = { notify: jest.fn() } as any;
      const service = new RolesPermissionsService(
        roleRepo,
        {} as any,
        {} as any,
        {} as any,
        employeeRepo,
        dataSource,
        notificationsService,
        permissionCache,
      );

      await expect(service.assignRolesToEmployee(5, { roleIds: [2] })).rejects.toThrow(ConflictException);
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });

  describe('assignPermissionsToRole', () => {
    it('rejects when the change would leave no one holding rbac.manage', async () => {
      const permissionRepo = { find: jest.fn().mockResolvedValue([{ permissionId: 9 }]) } as any;
      const roleRepo = { findOne: jest.fn().mockResolvedValue({ roleId: 1, rolePermissions: [] }) } as any;
      const manager = {
        delete: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_entity, v) => v),
        save: jest.fn().mockResolvedValue(undefined),
        createQueryBuilder: jest.fn(() => mockQueryBuilder(0)),
        findOne: jest.fn(),
      };
      const dataSource = { transaction: jest.fn((cb) => cb(manager)) } as any;
      const notificationsService = { notifyMany: jest.fn().mockResolvedValue(undefined) } as any;
      const employeeRoleRepo = { find: jest.fn().mockResolvedValue([{ employeeId: 5 }, { employeeId: 6 }]) } as any;
      const service = new RolesPermissionsService(
        roleRepo,
        permissionRepo,
        {} as any,
        employeeRoleRepo,
        {} as any,
        dataSource,
        notificationsService,
        permissionCache,
      );

      await expect(service.assignPermissionsToRole(1, { permissionIds: [9] })).rejects.toThrow(ConflictException);
      expect(manager.findOne).not.toHaveBeenCalled();
      expect(permissionCache.clear).not.toHaveBeenCalled();
      expect(notificationsService.notifyMany).not.toHaveBeenCalled();
    });

    it('saves the new permission set when at least one employee would still hold rbac.manage', async () => {
      const permissionRepo = { find: jest.fn().mockResolvedValue([{ permissionId: 9 }]) } as any;
      const roleRepo = { findOne: jest.fn().mockResolvedValue({ roleId: 1, rolePermissions: [] }) } as any;
      const manager = {
        delete: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_entity, v) => v),
        save: jest.fn().mockResolvedValue(undefined),
        createQueryBuilder: jest.fn(() => mockQueryBuilder(1)),
        findOne: jest.fn().mockResolvedValue({ roleId: 1, rolePermissions: [] }),
      };
      const dataSource = { transaction: jest.fn((cb) => cb(manager)) } as any;
      const notificationsService = { notifyMany: jest.fn().mockResolvedValue(undefined) } as any;
      const employeeRoleRepo = { find: jest.fn().mockResolvedValue([{ employeeId: 5 }, { employeeId: 6 }]) } as any;
      const service = new RolesPermissionsService(
        roleRepo,
        permissionRepo,
        {} as any,
        employeeRoleRepo,
        {} as any,
        dataSource,
        notificationsService,
        permissionCache,
      );

      await expect(service.assignPermissionsToRole(1, { permissionIds: [9] })).resolves.toEqual({
        roleId: 1,
        rolePermissions: [],
      });

      // ทุกคนที่ถือ role นี้ต้องเห็นสิทธิ์ใหม่ทันที ไม่ต้องรอแคช 30s
      expect(permissionCache.clear).toHaveBeenCalled();
      // แจ้งเตือนจริง (ขึ้น toast + frontend refetch เอง) แต่ไม่ยิงอีเมลหาทุกคนที่ถือ role
      expect(notificationsService.notifyMany).toHaveBeenCalledWith(
        [5, 6],
        'permissions_updated',
        expect.any(String),
        expect.any(String),
        'role',
        1,
        { sendEmail: false },
      );
    });
  });
});
