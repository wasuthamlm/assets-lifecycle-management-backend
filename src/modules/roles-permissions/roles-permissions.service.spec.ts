import { NotFoundException } from '@nestjs/common';
import { RolesPermissionsService } from './roles-permissions.service';

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
  });
});
