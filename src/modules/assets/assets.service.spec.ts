import { ConflictException } from '@nestjs/common';
import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  describe('create', () => {
    it('defaults currentStatus to in_stock when not provided, so it counts as available immediately', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((v) => v),
        save: jest.fn((v) => Promise.resolve({ assetId: 1, ...v })),
      } as any;
      const service = new AssetsService(repo, {} as any, {} as any, {} as any, {} as any);

      const result = await service.create({
        categoryId: 1,
        assetName: 'Notebook',
        serialNumber: 'SN-1',
        brand: 'Dell',
        model: 'Latitude',
      } as any);

      expect(result.currentStatus).toBe('in_stock');
    });

    it('generates assetNo as a UUID server-side instead of accepting one from the client', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((v) => v),
        save: jest.fn((v) => Promise.resolve({ assetId: 1, ...v })),
      } as any;
      const service = new AssetsService(repo, {} as any, {} as any, {} as any, {} as any);

      const result = await service.create({
        categoryId: 1,
        assetName: 'Notebook',
        serialNumber: 'SN-UUID',
        brand: 'Dell',
        model: 'Latitude',
      } as any);

      expect(result.assetNo).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('does not override an explicitly provided currentStatus', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((v) => v),
        save: jest.fn((v) => Promise.resolve({ assetId: 1, ...v })),
      } as any;
      const service = new AssetsService(repo, {} as any, {} as any, {} as any, {} as any);

      const result = await service.create({
        categoryId: 1,
        assetName: 'Notebook',
        serialNumber: 'SN-2',
        brand: 'Dell',
        model: 'Latitude',
        currentStatus: 'disposed',
      } as any);

      expect(result.currentStatus).toBe('disposed');
    });

    it('rejects a duplicate serial number that belongs to another asset', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({ assetId: 99, assetNo: 'FA-EXISTING', serialNumber: 'SN-DUP' }),
      } as any;
      const service = new AssetsService(repo, {} as any, {} as any, {} as any, {} as any);

      await expect(
        service.create({
          categoryId: 1,
          assetName: 'Notebook',
          serialNumber: 'SN-DUP',
          brand: 'Dell',
          model: 'Latitude',
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('rejects changing serialNumber to one already used by a different asset', async () => {
      const repo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ assetId: 1, serialNumber: 'SN-OLD' }) // findOne(id) via findOne()
          .mockResolvedValueOnce({ assetId: 2, assetNo: 'FA-OTHER', serialNumber: 'SN-NEW' }), // duplicate check
      } as any;
      const service = new AssetsService(repo, {} as any, {} as any, {} as any, {} as any);

      await expect(service.update(1, { serialNumber: 'SN-NEW' } as any)).rejects.toThrow(ConflictException);
    });

    it('allows saving without changing serialNumber', async () => {
      const asset = { assetId: 1, serialNumber: 'SN-OLD', assetName: 'Notebook' };
      const repo = {
        findOne: jest.fn().mockResolvedValue(asset),
        save: jest.fn((v) => Promise.resolve(v)),
      } as any;
      const service = new AssetsService(repo, {} as any, {} as any, {} as any, {} as any);

      const result = await service.update(1, { assetName: 'Notebook Pro' } as any);
      expect(result.assetName).toBe('Notebook Pro');
    });
  });
});
