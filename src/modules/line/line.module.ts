import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AuthModule } from '../auth/auth.module';
import { SupportTicketsModule } from '../support-tickets/support-tickets.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { LineCoreModule } from './line-core.module';
import { LineLinkService } from './line-link.service';
import { LineIdTokenGuard } from './line-id-token.guard';
import { LineLinkController, LineLiffController, LineWebhookController } from './line.controller';
import { LineChatService } from './line-chat.service';
import { SupportTicket } from '../support-tickets/entities/support-ticket.entity';
import { Asset } from '../assets/entities/asset.entity';
import { Requisition } from '../requisitions/entities/requisition.entity';
import { RequisitionsModule } from '../requisitions/requisitions.module';
import { LineBorrowService } from './line-borrow.service';
import { LineStaffService } from './line-staff.service';
import { Attachment } from '../attachments/entities/attachment.entity';
import { StorageModule } from '../storage/storage.module';
import { LineLinkAttempt, LineLinkCode } from './entities/line-link-code.entity';

/**
 * แจ้งปัญหา IT ผ่าน LINE OA — หน้า LIFF (ใน frontend repo) เรียก /line/liff/* ด้วย LINE ID token
 * และแชทบอท: พิมพ์อาการในแชท OA → webhook /line/webhook (ตรวจลายเซ็นด้วย channel secret) → เปิด ticket
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Employee, SupportTicket, Asset, Requisition, LineLinkCode, LineLinkAttempt, Attachment]),
    StorageModule,
    LineCoreModule,
    AuthModule,
    SupportTicketsModule,
    AssignmentsModule,
    RequisitionsModule,
  ],
  controllers: [LineLinkController, LineLiffController, LineWebhookController],
  providers: [LineLinkService, LineIdTokenGuard, LineChatService, LineBorrowService, LineStaffService],
})
export class LineModule {}
