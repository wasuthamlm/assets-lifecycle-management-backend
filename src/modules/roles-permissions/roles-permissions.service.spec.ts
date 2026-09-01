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
      );

      await service.assignRolesToEmployee(5, { roleIds: [2] });

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
      const service = new RolesPermissionsService(
        roleRepo,
        permissionRepo,
        {} as any,
        {} as any,
        {} as any,
        dataSource,
        {} as any,
      );

      await expect(service.assignPermissionsToRole(1, { permissionIds: [9] })).rejects.toThrow(ConflictException);
      expect(manager.findOne).not.toHaveBeenCalled();
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
      const service = new RolesPermissionsService(
        roleRepo,
        permissionRepo,
        {} as any,
        {} as any,
        {} as any,
        dataSource,
        {} as any,
      );

      await expect(service.assignPermissionsToRole(1, { permissionIds: [9] })).resolves.toEqual({
        roleId: 1,
        rolePermissions: [],
      });
    });
  });
});
