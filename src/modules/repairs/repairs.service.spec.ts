import { RepairsService } from './repairs.service';
import { RepairStatus } from '@common/enums';

describe('RepairsService#findAll (search/filter/pagination)', () => {
  function buildService(rows: any[] = [], total = 0) {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    };
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;
    const service = new RepairsService(repo, {} as any, {} as any, {} as any);
    return { service, qb };
  }

  it('returns the Paginated<Repair> shape', async () => {
    const { service } = buildService([{ repairId: 1 }], 1);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({ data: [{ repairId: 1 }], total: 1, page: 1, limit: 20 });
  });

  it('applies skip/take from page and limit', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({ page: 2, limit: 10 });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  it('filters by status when given', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({ status: RepairStatus.CLOSED });
    expect(qb.andWhere).toHaveBeenCalledWith('r.status = :status', { status: RepairStatus.CLOSED });
  });

  it('adds a search filter across asset name/no and problem description', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({ search: 'notebook' });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { s: '%notebook%' });
  });
});
