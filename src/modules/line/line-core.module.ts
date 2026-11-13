import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { LineAuthService } from './line-auth.service';
import { LineMessagingService } from './line-messaging.service';

/**
 * แยกจาก LineModule (ที่มี controller) เพราะ SupportTicketsModule ต้องใช้ LineMessagingService
 * ส่วน LineModule ต้องใช้ SupportTicketsService — ถ้ารวมไว้ module เดียวจะ import วนกัน
 */
@Module({
  imports: [TypeOrmModule.forFeature([Employee])],
  providers: [LineAuthService, LineMessagingService],
  exports: [LineAuthService, LineMessagingService],
})
export class LineCoreModule {}
