import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Warranty } from '../warranty/entities/warranty.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { EmployeeRole } from '../roles-permissions/entities/employee-role.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsCron } from './warranty-expiry.cron';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Employee, Warranty, Assignment, EmployeeRole]),
    MailModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsCron],
  exports: [NotificationsService],
})
export class NotificationsModule {}
