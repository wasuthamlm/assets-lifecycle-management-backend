import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RolePreassignmentsService } from './role-preassignments.service';

function qbReturning(value: unknown) {
  const qb: any = {};
  qb.where = jest.fn(() => qb);
  qb.andWhere = jest.fn(() => qb);
  qb.getOne = jest.fn().mockResolvedValue(value);
  return qb;
}

function makeService(overrides: {
  repo?: any;
  roleRepo?: any;
  employee?: unknown;
  linkedUser?: unknown;
  domainAllowed?: boolean;
  dataSource?: any;
}) {
  const repo = overrides.repo ?? {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v) => v),
    save: jest.fn((v) => Promise.resolve(v)),
  };
  const roleRepo = overrides.roleRepo ?? { find: jest.fn().mockResolvedValue([{ roleId: 2 }]) };
  const employeeRepo = { createQueryBuilder: jest.fn(() => qbReturning(overrides.employee ?? null)) };
  const usersRepo = { createQueryBuilder: jest.fn(() => qbReturning(overrides.linkedUser ?? null)) };
  const allowedDomainsService = { isDomainAllowed: jest.fn().mockResolvedValue(overrides.domainAllowed ?? true) };
  const service = new RolePreassignmentsService(
    repo,
    roleRepo,
    employeeRepo as any,
    usersRepo as any,
    allowedDomainsService as any,
    overrides.dataSource ?? ({} as any),
  );
  return { service, repo, roleRepo };
}

describe('RolePreassignmentsService', () => {
  describe('upsert', () => {
    it('stores the email lowercased with de-duplicated role ids', async () => {
      const { service, repo } = makeService({});

      await service.upsert({ email: '  Somchai.J@MillimedThailand.com ', roleIds: [2, 2] }, 1);

      expect(repo.create).toHaveBeenCalledWith({
        email: 'somchai.j@millimedthailand.com',
        roleIds: [2],
        createdByUserId: 1,
      });
    });

    it('replaces the roles of an existing pre-assignment for the same email', async () => {
      const existing = { rolePreassignmentId: 9, email: 'a@millimedthailand.com', roleIds: [1] };
      const repo = { findOne: jest.fn().mockResolvedValue(existing), save: jest.fn((v) => Promise.resolve(v)) };
      const { service } = makeService({ repo });

      await service.upsert({ email: 'a@millimedthailand.com', roleIds: [2] }, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ rolePreassignmentId: 9, roleIds: [2] }));
    });

    it('rejects an email whose domain is not allowlisted for SSO', async () => {
      const { service } = makeService({ domainAllowed: false });
      await expect(service.upsert({ email: 'x@gmail.com', roleIds: [2] }, 1)).rejects.toThrow(BadRequestException);
    });

    it('rejects when an employee with this email already exists', async () => {
      const { service } = makeService({ employee: { employeeId: 3 } });
      await expect(service.upsert({ email: 'a@millimedthailand.com', roleIds: [2] }, 1)).rejects.toThrow(ConflictException);
    });

    it('rejects when a user with this email is already linked to an employee', async () => {
      const { service } = makeService({ linkedUser: { userId: 4, employeeId: 3 } });
      await expect(service.upsert({ email: 'a@millimedthailand.com', roleIds: [2] }, 1)).rejects.toThrow(ConflictException);
    });

    it('rejects unknown role ids', async () => {
      const { service } = makeService({ roleRepo: { find: jest.fn().mockResolvedValue([]) } });
      await expect(service.upsert({ email: 'a@millimedthailand.com', roleIds: [99] }, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('consumeForEmployee', () => {
    it('returns [] and touches nothing when the email has no pre-assignment', async () => {
      const dataSource = { transaction: jest.fn() };
      const { service } = makeService({ dataSource });

      await expect(service.consumeForEmployee('nobody@millimedthailand.com', 5)).resolves.toEqual([]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('inserts employee_roles for still-existing roles and deletes the pre-assignment', async () => {
      const row = { rolePreassignmentId: 7, email: 'a@millimedthailand.com', roleIds: [2, 99] };
      const repo = { findOne: jest.fn().mockResolvedValue(row) };
      const insertQb: any = {};
      insertQb.insert = jest.fn(() => insertQb);
      insertQb.into = jest.fn(() => insertQb);
      insertQb.values = jest.fn(() => insertQb);
      insertQb.orIgnore = jest.fn(() => insertQb);
      insertQb.execute = jest.fn().mockResolvedValue(undefined);
      const manager = { createQueryBuilder: jest.fn(() => insertQb), delete: jest.fn().mockResolvedValue(undefined) };
      const dataSource = { transaction: jest.fn((cb) => cb(manager)) };
      // role 99 ถูกลบออกจากระบบไประหว่างรอ login
      const { service } = makeService({ repo, dataSource, roleRepo: { find: jest.fn().mockResolvedValue([{ roleId: 2 }]) } });

      const applied = await service.consumeForEmployee('A@MillimedThailand.com', 5);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'a@millimedthailand.com' } });
      expect(applied).toEqual([2]);
      expect(insertQb.values).toHaveBeenCalledWith([expect.objectContaining({ employeeId: 5, roleId: 2 })]);
      expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { rolePreassignmentId: 7 });
    });
  });
});
