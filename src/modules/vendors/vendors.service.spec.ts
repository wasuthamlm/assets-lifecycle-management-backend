import { BadRequestException } from '@nestjs/common';
import { VendorsService } from './vendors.service';

describe('VendorsService#remove (referential-integrity guard)', () => {
  function buildService(
    vendor: any,
    counts: { asset?: number; holder?: number; po?: number; repair?: number; warranty?: number } = {},
  ) {
    const repo = { findOne: jest.fn().mockResolvedValue(vendor), remove: jest.fn() } as any;
    const assetRepo = { count: jest.fn().mockResolvedValueOnce(counts.asset ?? 0).mockResolvedValueOnce(counts.holder ?? 0) };
    const countsByEntity: Record<string, number> = {
      PurchaseOrder: counts.po ?? 0,
      Repair: counts.repair ?? 0,
      Warranty: counts.warranty ?? 0,
    };
    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity.name === 'Asset') return assetRepo;
        return { count: jest.fn().mockResolvedValue(countsByEntity[entity.name] ?? 0) };
      }),
    } as any;
    const service = new VendorsService(repo, dataSource);
    return { service, repo };
  }

  it('deletes a vendor with nothing referencing it', async () => {
    const { service, repo } = buildService({ vendorId: 1 });
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalled();
  });

  it('rejects deleting a vendor referenced as the purchase-source on an asset', async () => {
    const { service, repo } = buildService({ vendorId: 1 }, { asset: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a vendor currently holding an asset (polymorphic holder)', async () => {
    const { service, repo } = buildService({ vendorId: 1 }, { holder: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a vendor with an outstanding purchase order', async () => {
    const { service, repo } = buildService({ vendorId: 1 }, { po: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a vendor referenced by a repair or warranty record', async () => {
    const { service, repo } = buildService({ vendorId: 1 }, { warranty: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
