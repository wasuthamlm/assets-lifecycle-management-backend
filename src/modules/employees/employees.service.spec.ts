import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  describe('findDirectory', () => {
    it('only returns employees with the it_admin role', async () => {
      const approvers = [{ employeeId: 1, fullName: 'IT Admin' }];
      const queryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(approvers),
      };
      const repo = { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as any;
      const service = new EmployeesService(repo);

      const result = await service.findDirectory();

      expect(queryBuilder.where).toHaveBeenCalledWith('r.roleName = :roleName', { roleName: 'it_admin' });
      expect(result).toEqual(approvers);
    });
  });
});
