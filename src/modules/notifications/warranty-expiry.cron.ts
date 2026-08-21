import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Warranty } from '../warranty/entities/warranty.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { EmployeeRole } from '../roles-permissions/entities/employee-role.entity';
import { NotificationsService } from './notifications.service';
import { NotificationType, WarrantyStatus, HolderType } from '@common/enums';

const WARRANTY_LOOKAHEAD_DAYS = 30;

@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name);

  constructor(
    @InjectRepository(Warranty) private warrantyRepo: Repository<Warranty>,
    @InjectRepository(Assignment) private assignmentRepo: Repository<Assignment>,
    @InjectRepository(EmployeeRole) private employeeRoleRepo: Repository<EmployeeRole>,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async notifyExpiringWarranties() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + WARRANTY_LOOKAHEAD_DAYS);

    const expiring = await this.warrantyRepo.find({
      where: { status: WarrantyStatus.ACTIVE, endDate: LessThanOrEqual(cutoff) },
      relations: ['asset'],
    });
    if (expiring.length === 0) return;

    const itAdmins = await this.employeeRoleRepo.find({
      where: { role: { roleName: 'it_admin' } },
      relations: ['role'],
    });

    for (const warranty of expiring) {
      for (const er of itAdmins) {
        const already = await this.notifications.alreadyNotifiedToday(
          er.employeeId,
          NotificationType.WARRANTY_EXPIRING,
          warranty.warrantyId,
        );
        if (already) continue;

        await this.notifications.notify(
          er.employeeId,
          NotificationType.WARRANTY_EXPIRING,
          'ประกันใกล้หมดอายุ',
          `ประกันของทรัพย์สิน ${warranty.asset?.assetNo ?? warranty.assetId} จะหมดอายุวันที่ ${warranty.endDate}`,
          'warranty',
          warranty.warrantyId,
        );
      }
    }
    this.logger.debug(`แจ้งเตือนประกันใกล้หมดอายุ: ${expiring.length} รายการ`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async notifyOverdueAssignments() {
    const now = new Date();

    const overdue = await this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.asset', 'asset')
      .where('a.holderType = :holderType', { holderType: HolderType.EMPLOYEE })
      .andWhere('a.dueDate IS NOT NULL')
      .andWhere('a.dueDate < :now', { now })
      .andWhere('a.returnedDate IS NULL')
      .getMany();

    for (const assignment of overdue) {
      const already = await this.notifications.alreadyNotifiedToday(
        assignment.holderId,
        NotificationType.ASSIGNMENT_OVERDUE,
        assignment.assignmentId,
      );
      if (already) continue;

      await this.notifications.notify(
        assignment.holderId,
        NotificationType.ASSIGNMENT_OVERDUE,
        'ทรัพย์สินเลยกำหนดคืน',
        `ทรัพย์สิน ${assignment.asset?.assetNo ?? assignment.assetId} เลยกำหนดคืนตั้งแต่ ${assignment.dueDate}`,
        'assignment',
        assignment.assignmentId,
      );
    }
    if (overdue.length > 0) this.logger.debug(`แจ้งเตือนทรัพย์สินเลยกำหนดคืน: ${overdue.length} รายการ`);
  }
}
