import { GoodsReceiptService } from './goods-receipt.service';
import { PurchaseOrder } from '../purchasing/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../purchasing/entities/purchase-order-item.entity';
import { GoodsReceipt } from './entities/goods-receipt.entity';

describe('GoodsReceiptService#create (PO row locked when recomputing status)', () => {
  function buildService({ po, poItem }: { po: any; poItem: any }) {
    const managerCreate = jest.fn().mockImplementation((_entity: any, data: any) => data);
    const managerSave = jest.fn().mockImplementation((entity: any) => Promise.resolve(entity));
    const managerFindOne = jest.fn().mockImplementation((entity: any) => {
      if (entity === PurchaseOrderItem) return Promise.resolve(poItem);
      if (entity === PurchaseOrder) return Promise.resolve(po);
      if (entity === GoodsReceipt) return Promise.resolve({ receiptId: 1, items: [] });
      return Promise.resolve(null);
    });
    const managerFind = jest.fn().mockResolvedValue([{ ...poItem, receivedQuantity: poItem.quantity }]);
    const manager = { create: managerCreate, save: managerSave, findOne: managerFindOne, find: managerFind } as any;
    const dataSource = { transaction: jest.fn().mockImplementation((cb: any) => cb(manager)) } as any;
    const stockService = { adjust: jest.fn().mockResolvedValue(undefined) } as any;
    const movementsService = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new GoodsReceiptService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      stockService,
      movementsService,
      dataSource,
    );
    return { service, manager };
  }

  it('locks the PO row with pessimistic_write before recomputing its status', async () => {
    const po = { poId: 1, status: 'ordered', items: [] };
    const poItem = { poItemId: 1, poId: 1, quantity: 5, receivedQuantity: 0 };
    const { service, manager } = buildService({ po, poItem });

    const dto = {
      receiptNo: 'GR-1',
      poId: 1,
      locationId: 1,
      items: [{ poItemId: 1, stockItemId: 9, receivedQuantity: 5, conditionOnReceipt: 'normal' }],
    } as any;

    await service.create(dto, 1);

    expect(manager.findOne).toHaveBeenCalledWith(
      PurchaseOrder,
      expect.objectContaining({ where: { poId: 1 }, lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('marks the PO fully received once every item is received', async () => {
    const po = { poId: 1, status: 'ordered', items: [] };
    const poItem = { poItemId: 1, poId: 1, quantity: 5, receivedQuantity: 0 };
    const { service, manager } = buildService({ po, poItem });

    const dto = {
      receiptNo: 'GR-1',
      poId: 1,
      locationId: 1,
      items: [{ poItemId: 1, stockItemId: 9, receivedQuantity: 5, conditionOnReceipt: 'normal' }],
    } as any;

    await service.create(dto, 1);

    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'received' }));
  });
});

describe('GoodsReceiptService#findAll (search/pagination, item count without join)', () => {
  function buildService(rows: any[] = [], total = 0) {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    };
    const receiptRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;
    const service = new GoodsReceiptService(receiptRepo, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, qb };
  }

  it('returns the Paginated<GoodsReceipt> shape and maps itemCount via loadRelationCountAndMap', async () => {
    const { service, qb } = buildService([{ receiptId: 1 }], 1);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({ data: [{ receiptId: 1 }], total: 1, page: 1, limit: 20 });
    expect(qb.loadRelationCountAndMap).toHaveBeenCalledWith('gr.itemCount', 'gr.items');
  });

  it('adds a search filter across receipt number and PO number', async () => {
    const { service, qb } = buildService([], 0);
    await service.findAll({ search: 'GR-2026' });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { s: '%GR-2026%' });
  });
});
