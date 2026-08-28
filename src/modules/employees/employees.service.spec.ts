import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  describe('findDirectory', () => {
    it('only returns employees with the requisition.approve permission', async () => {
      const approvers = [{ employeeId: 1, fullName: 'HR Person' }];
      const queryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(approvers),
      };
      const repo = { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as any;
      const service = new EmployeesService(repo, {} as any, {} as any, {} as any, {} as any);

      const result = await service.findDirectory();

      expect(queryBuilder.where).toHaveBeenCalledWith('p.permissionCode = :code', { code: 'requisition.approve' });
      expect(result).toEqual(approvers);
    });
  });
});
