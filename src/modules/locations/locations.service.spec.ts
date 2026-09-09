import { BadRequestException } from '@nestjs/common';
import { LocationsService } from './locations.service';

describe('LocationsService#remove (referential-integrity guard)', () => {
  function buildService(location: any, counts: { asset?: number; holder?: number; stock?: number } = {}) {
    const repo = { findOne: jest.fn().mockResolvedValue(location), remove: jest.fn() } as any;
    const assetRepo = { count: jest.fn().mockResolvedValueOnce(counts.asset ?? 0).mockResolvedValueOnce(counts.holder ?? 0) };
    const stockRepo = { count: jest.fn().mockResolvedValue(counts.stock ?? 0) };
    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity: any) => (entity.name === 'Asset' ? assetRepo : stockRepo)),
    } as any;
    const service = new LocationsService(repo, dataSource);
    return { service, repo, assetRepo, stockRepo };
  }

  it('deletes a location with nothing referencing it', async () => {
    const { service, repo } = buildService({ locationId: 1, children: [] });
    await service.remove(1);
    expect(repo.remove).toHaveBeenCalled();
  });

  it('rejects deleting a location that still has child locations', async () => {
    const { service, repo } = buildService({ locationId: 1, children: [{ locationId: 2 }] });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a location an asset currently sits at (currentLocationId)', async () => {
    const { service, repo } = buildService({ locationId: 1, children: [] }, { asset: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a location an asset is polymorphically held at (currentHolderId)', async () => {
    const { service, repo } = buildService({ locationId: 1, children: [] }, { asset: 0, holder: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting a location with stock levels attached', async () => {
    const { service, repo } = buildService({ locationId: 1, children: [] }, { stock: 1 });
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
