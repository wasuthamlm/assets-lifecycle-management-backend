import { WarrantyService } from './warranty.service';
import { WarrantyStatus } from '@common/enums';

describe('WarrantyService#findExpiring', () => {
  function buildService(rows: any[] = []) {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;
    const assetRepo = {} as any;
    const movementsService = {} as any;
    const dataSource = {} as any;
    const service = new WarrantyService(repo, assetRepo, movementsService, dataSource);
    return { service, qb };
  }

  it('filters to ACTIVE status', async () => {
    const { service, qb } = buildService([]);
    await service.findExpiring();
    expect(qb.where).toHaveBeenCalledWith('w.status = :status', { status: WarrantyStatus.ACTIVE });
  });

  it('defaults the lookahead window to 30 days', async () => {
    const { service, qb } = buildService([]);
    const before = Date.now();
    await service.findExpiring();
    const call = qb.andWhere.mock.calls.find((c: any[]) => c[0] === 'w.endDate <= :cutoff');
    const cutoff: Date = call[1].cutoff;
    const expectedMs = before + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(5000);
  });

  it('respects a custom withinDays window', async () => {
    const { service, qb } = buildService([]);
    const before = Date.now();
    await service.findExpiring(7);
    const call = qb.andWhere.mock.calls.find((c: any[]) => c[0] === 'w.endDate <= :cutoff');
    const cutoff: Date = call[1].cutoff;
    const expectedMs = before + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(5000);
  });

  it('orders by soonest-expiring first', async () => {
    const { service, qb } = buildService([]);
    await service.findExpiring();
    expect(qb.orderBy).toHaveBeenCalledWith('w.endDate', 'ASC');
  });

  it('returns the rows from the query', async () => {
    const rows = [{ warrantyId: 1 }];
    const { service } = buildService(rows);
    await expect(service.findExpiring()).resolves.toBe(rows);
  });
});
