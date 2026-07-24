import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from '../assets/entities/asset.entity';
import { Requisition } from '../requisitions/entities/requisition.entity';
import { ApprovalStatus, RequestType } from '@common/enums';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Asset) private assetsRepo: Repository<Asset>,
    @InjectRepository(Requisition) private requisitionsRepo: Repository<Requisition>,
  ) {}

  async summary() {
    const [
      totalAssets,
      totalAssetValueRaw,
      pending,
      approved,
      rejected,
      withdrawCount,
      borrowCount,
      recentRequisitions,
      recentAssets,
      byPersonRaw,
    ] = await Promise.all([
      this.assetsRepo.count(),
      this.assetsRepo.createQueryBuilder('a').select('COALESCE(SUM(a.purchaseCost), 0)', 'sum').getRawOne<{ sum: string }>(),
      this.requisitionsRepo.count({ where: { overallStatus: ApprovalStatus.PENDING } }),
      this.requisitionsRepo.count({ where: { overallStatus: ApprovalStatus.APPROVED } }),
      this.requisitionsRepo.count({ where: { overallStatus: ApprovalStatus.REJECTED } }),
      this.requisitionsRepo.count({ where: { requestType: RequestType.WITHDRAW } }),
      this.requisitionsRepo.count({ where: { requestType: RequestType.BORROW } }),
      this.requisitionsRepo.find({
        relations: ['requestedByEmployee'],
        order: { createdAt: 'DESC' },
        take: 5,
      }),
      this.assetsRepo.find({ order: { createdAt: 'DESC' }, take: 5 }),
      this.requisitionsRepo
        .createQueryBuilder('r')
        .innerJoin('r.requestedByEmployee', 'e')
        .select('e.employeeId', 'employeeId')
        .addSelect('e.fullName', 'fullName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('e.employeeId')
        .addGroupBy('e.fullName')
        .orderBy('COUNT(*)', 'DESC')
        .limit(10)
        .getRawMany<{ employeeId: number; fullName: string; count: string }>(),
    ]);

    const recentActivity = [
      ...recentRequisitions.map((r) => ({
        type: 'requisition' as const,
        id: r.requisitionId,
        title: r.requisitionNo,
        subtitle: r.requestedByEmployee?.fullName ?? null,
        status: r.overallStatus,
        createdAt: r.createdAt,
      })),
      ...recentAssets.map((a) => ({
        type: 'asset' as const,
        id: a.assetId,
        title: a.assetNo,
        subtitle: a.assetName,
        status: a.currentStatus,
        createdAt: a.createdAt,
      })),
    ]
      .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
      .slice(0, 10);

    return {
      totalAssets,
      totalAssetValue: Number(totalAssetValueRaw?.sum ?? 0),
      requisitions: {
        pending,
        approved,
        rejected,
        byRequestType: {
          withdraw: withdrawCount,
          borrow: borrowCount,
        },
        byPerson: byPersonRaw.map((row) => ({
          employeeId: row.employeeId,
          fullName: row.fullName,
          count: Number(row.count),
        })),
      },
      recentActivity,
    };
  }
}
