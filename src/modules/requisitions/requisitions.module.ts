import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requisition } from './entities/requisition.entity';
import { RequisitionItem } from './entities/requisition-item.entity';
import { RequisitionApproval } from './entities/requisition-approval.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Asset } from '../assets/entities/asset.entity';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Requisition, RequisitionItem, RequisitionApproval, Employee, Asset]),
    NotificationsModule,
    AttachmentsModule,
    AssignmentsModule,
  ],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
  exports: [RequisitionsService, TypeOrmModule],
})
export class RequisitionsModule {}
