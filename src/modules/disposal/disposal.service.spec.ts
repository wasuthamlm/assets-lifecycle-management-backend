import { DisposalService } from './disposal.service';

describe('DisposalService#findAll (search/pagination)', () => {
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
    const service = new DisposalService(repo, {} as any, {} as any, {} as any, {} as any);
    return { service, qb };
  }

  it('returns the Paginated<Disposal> shape', async () => {
    const { service } = buildService([{ disposalId: 1 }], 1);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({ data: [{ disposalId: 1 }], total: 1, page: 1, limit: 20 });
  });

  it('applies skip/take from page and limit', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({ page: 3, limit: 5 });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(5);
  });

  it('adds a search filter across asset name/no', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({ search: 'notebook' });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { s: '%notebook%' });
  });

  it('does not filter when no search is given', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({});
    expect(qb.andWhere).not.toHaveBeenCalled();
  });
});
