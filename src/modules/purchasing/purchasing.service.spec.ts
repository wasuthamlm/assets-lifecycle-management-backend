import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { PoStatus } from '@common/enums';

describe('PurchasingService#updateStatus (concurrency-safe)', () => {
  function buildService(po: any) {
    const managerSave = jest.fn().mockImplementation((entity: any) => Promise.resolve(entity));
    const managerFindOne = jest.fn().mockResolvedValue(po);
    const manager = { findOne: managerFindOne, save: managerSave } as any;
    const dataSource = { transaction: jest.fn().mockImplementation((cb: any) => cb(manager)) } as any;
    const poRepo = {} as any;
    const poItemRepo = {} as any;
    const service = new PurchasingService(poRepo, poItemRepo, dataSource);
    return { service, manager, dataSource };
  }

  it('locks the PO row with pessimistic_write inside a transaction, not a plain read', async () => {
    const po = { poId: 1, status: PoStatus.DRAFT };
    const { service, manager, dataSource } = buildService(po);

    await service.updateStatus(1, { status: PoStatus.ORDERED } as any, 5);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ where: { poId: 1 }, lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('rejects an invalid status transition', async () => {
    const po = { poId: 1, status: PoStatus.RECEIVED };
    const { service } = buildService(po);

    await expect(service.updateStatus(1, { status: PoStatus.DRAFT } as any, 5)).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the PO does not exist', async () => {
    const { service } = buildService(null);
    await expect(service.updateStatus(1, { status: PoStatus.ORDERED } as any, 5)).rejects.toThrow(NotFoundException);
  });

  it('sets approvedBy when transitioning to ORDERED', async () => {
    const po = { poId: 1, status: PoStatus.DRAFT };
    const { service, manager } = buildService(po);

    await service.updateStatus(1, { status: PoStatus.ORDERED } as any, 5);

    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ status: PoStatus.ORDERED, approvedBy: 5 }));
  });
});

describe('PurchasingService#findAll (search/filter/pagination, two-step items fetch)', () => {
  function buildService(rows: any[] = [], total = 0, withItemsRows: any[] = rows) {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    };
    const poRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest.fn().mockResolvedValue(withItemsRows),
    } as any;
    const service = new PurchasingService(poRepo, {} as any, {} as any);
    return { service, qb, poRepo };
  }

  it('does not join items in the first (count/paginate) query, to avoid row multiplication', async () => {
    const { service, qb } = buildService([{ poId: 1 }], 1, [{ poId: 1, items: [] }]);
    await service.findAll({ page: 1, limit: 20 });
    expect(qb.leftJoinAndSelect).not.toHaveBeenCalledWith('po.items', expect.anything());
  });

  it('fetches items in a second query for just the paginated page ids, and returns them', async () => {
    const { service, poRepo } = buildService([{ poId: 1 }], 1, [{ poId: 1, items: [{ poItemId: 1 }] }]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(poRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: expect.arrayContaining(['items']) }),
    );
    expect(result).toEqual({ data: [{ poId: 1, items: [{ poItemId: 1 }] }], total: 1, page: 1, limit: 20 });
  });

  it('returns an empty page without querying items when there are no rows', async () => {
    const { service, poRepo } = buildService([], 0);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(poRepo.find).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('filters by status when given', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({ status: PoStatus.ORDERED });
    expect(qb.andWhere).toHaveBeenCalledWith('po.status = :status', { status: PoStatus.ORDERED });
  });

  it('adds a search filter across PO number and vendor name', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({ search: 'PO-2026' });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { s: '%PO-2026%' });
  });
});
