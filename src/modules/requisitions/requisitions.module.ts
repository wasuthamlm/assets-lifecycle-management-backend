import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requisition } from './entities/requisition.entity';
import { RequisitionItem } from './entities/requisition-item.entity';
import { RequisitionApproval } from './entities/requisition-approval.entity';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Requisition, RequisitionItem, RequisitionApproval])],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
  exports: [RequisitionsService, TypeOrmModule],
})
export class RequisitionsModule {}
