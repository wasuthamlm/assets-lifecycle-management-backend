import { BadRequestException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';

describe('DepartmentsService#remove (referential-integrity guard)', () => {
  function buildService(department: any, counts: { employee?: number; assetHolder?: number } = {}) {
    const repo = { findOne: jest.fn().mockResolvedValue(department), remove: jest.fn() } as any;
    const employeeRepo = { count: jest.fn().mockResolvedValue(counts.employee ?? 0) };
    const assetRepo = { count: jest.fn().mockResolvedValue(counts.assetHolder ?? 0) };
    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity: any) => (entity.name === 'Employee' ? employeeRepo : assetRepo)),
    } as any;
    const service = new DepartmentsService(repo, dataSource);
    return { service, repo };
  }

  it('deletes a department with nothing referencing it', async () => {
    const { service, repo } = buildService({ departmentId: 1, children: [] });
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalled();
  });

  it('rejects deleting a department that still has sub-departments', async () => {
    const { service, repo } = buildService({ departmentId: 1, children: [{ departmentId: 2 }] });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a department that still has employees assigned', async () => {
    const { service, repo } = buildService({ departmentId: 1, children: [] }, { employee: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a department currently holding an asset (polymorphic holder)', async () => {
    const { service, repo } = buildService({ departmentId: 1, children: [] }, { assetHolder: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
