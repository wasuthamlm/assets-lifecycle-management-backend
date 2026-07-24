import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '../assets/entities/asset.entity';
import { Requisition } from '../requisitions/entities/requisition.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, Requisition])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
