import { MovementsService } from './movements.service';
import { MovementType } from '@common/enums';

describe('MovementsService#findAll (search/filter/pagination)', () => {
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
    const employeeRepo = { find: jest.fn().mockResolvedValue([]) } as any;
    const service = new MovementsService(repo, employeeRepo);
    return { service, qb };
  }

  it('returns the Paginated<Movement> shape', async () => {
    const rows = [{ movementId: 1, toHolderType: null, toHolderId: null }];
    const { service } = buildService(rows, 1);

    const result = await service.findAll({ page: 2, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.data).toHaveLength(1);
  });

  it('applies skip/take from page and limit', async () => {
    const { service, qb } = buildService([], 0);

    await service.findAll({ page: 3, limit: 20 });

    expect(qb.skip).toHaveBeenCalledWith(40);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it('defaults to page 1 / limit 20 when not provided', async () => {
    const { service, qb } = buildService([], 0);

    await service.findAll({});

    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
  });

  it('adds a search filter across asset/employee/notes when search is given', async () => {
    const { service, qb } = buildService([], 0);

    await service.findAll({ search: 'notebook' });

    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { s: '%notebook%' });
  });

  it('adds a movementType filter when given', async () => {
    const { service, qb } = buildService([], 0);

    await service.findAll({ movementType: MovementType.ISSUED });

    expect(qb.andWhere).toHaveBeenCalledWith('m.movementType = :movementType', { movementType: MovementType.ISSUED });
  });

  it('does not filter when no search/movementType/date is given', async () => {
    const { service, qb } = buildService([], 0);

    await service.findAll({});

    expect(qb.andWhere).not.toHaveBeenCalled();
  });
});
