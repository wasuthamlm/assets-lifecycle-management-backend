import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicketsController } from './support-tickets.controller';
import { RepairsModule } from '../repairs/repairs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { LineCoreModule } from '../line/line-core.module';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket]), RepairsModule, NotificationsModule, AttachmentsModule, LineCoreModule],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
  exports: [SupportTicketsService],
})
export class SupportTicketsModule {}
