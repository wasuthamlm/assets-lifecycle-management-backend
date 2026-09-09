import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Warranty } from '../warranty/entities/warranty.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeRole } from '../roles-permissions/entities/employee-role.entity';
import { NotificationsService } from './notifications.service';
import { NotificationType, WarrantyStatus, HolderType } from '@common/enums';

const WARRANTY_LOOKAHEAD_DAYS = 30;

// ต้องระบุ timezone ตรงๆ เพราะ Postgres session ที่นี่ตั้งเป็น UTC (เช็คแล้วด้วย SHOW TIMEZONE) แต่ business
// logic ทั้งหมดอิงเวลาไทย — ถ้าปล่อยให้ @Cron ใช้ TZ ของเครื่อง/container ที่รัน (ซึ่งอาจเป็น UTC ตอน deploy
// จริง ต่างจากเครื่อง dev นี้ที่บังเอิญตั้งเป็น Asia/Bangkok อยู่แล้ว) "8 โมงเช้า" จะกลายเป็นบ่าย 3 โมงตามเวลาไทย
const CRON_TIMEZONE = 'Asia/Bangkok';

@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name);

  constructor(
    @InjectRepository(Warranty) private warrantyRepo: Repository<Warranty>,
    @InjectRepository(Assignment) private assignmentRepo: Repository<Assignment>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(EmployeeRole) private employeeRoleRepo: Repository<EmployeeRole>,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: CRON_TIMEZONE })
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

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: CRON_TIMEZONE })
  async notifyOverdueAssignments() {
    // เทียบกับ "วันนี้ตามเวลาไทย" คำนวณฝั่ง Postgres ตรงๆ แทนที่จะส่ง JS Date เข้ามาเทียบ (`a.dueDate < :now`
    // เดิม) — Postgres session ที่นี่ตั้ง TZ เป็น UTC ดังนั้นถ้าเทียบด้วย now()/JS Date ตรงๆ ช่วง 00:00-06:59
    // เวลาไทยทุกวัน (ยังเป็นเมื่อวานตาม UTC) ผลจะเพี้ยนไปหนึ่งวันจากที่ผู้ใช้ไทยคาดหวัง
    const overdue = await this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.asset', 'asset')
      .where('a.holderType = :holderType', { holderType: HolderType.EMPLOYEE })
      .andWhere('a.dueDate IS NOT NULL')
      .andWhere("a.dueDate < (now() AT TIME ZONE 'Asia/Bangkok')::date")
      .andWhere('a.returnedDate IS NULL')
      .getMany();

    const itAdmins = await this.employeeRoleRepo.find({
      where: { role: { roleName: 'it_admin' } },
      relations: ['role'],
    });

    for (const assignment of overdue) {
      const already = await this.notifications.alreadyNotifiedToday(
        assignment.holderId,
        NotificationType.ASSIGNMENT_OVERDUE,
        assignment.assignmentId,
      );
      if (!already) {
        await this.notifications.notify(
          assignment.holderId,
          NotificationType.ASSIGNMENT_OVERDUE,
          'ทรัพย์สินเลยกำหนดคืน',
          `ทรัพย์สิน ${assignment.asset?.assetNo ?? assignment.assetId} เลยกำหนดคืนตั้งแต่ ${assignment.dueDate}`,
          'assignment',
          assignment.assignmentId,
        );
      }

      // แจ้ง it_admin ด้วย เพราะเดิมแจ้งแค่ผู้ยืม admin ไม่มีทางรู้เลยว่ามีของเกินกำหนดถ้าไม่เข้าไปเช็คเอง
      // ข้อความต้องระบุตัวผู้ถือครองด้วย (ต่างจากข้อความของผู้ยืมเองที่ไม่ต้องบอกว่า "ของใคร")
      const holder = await this.employeeRepo.findOne({ where: { employeeId: assignment.holderId } });
      for (const er of itAdmins) {
        const alreadyAdmin = await this.notifications.alreadyNotifiedToday(
          er.employeeId,
          NotificationType.ASSIGNMENT_OVERDUE,
          assignment.assignmentId,
        );
        if (alreadyAdmin) continue;

        await this.notifications.notify(
          er.employeeId,
          NotificationType.ASSIGNMENT_OVERDUE,
          'ทรัพย์สินเลยกำหนดคืน',
          `${holder?.fullName ?? `พนักงาน id ${assignment.holderId}`} ถือครองทรัพย์สิน ${assignment.asset?.assetNo ?? assignment.assetId} เกินกำหนดคืนตั้งแต่ ${assignment.dueDate}`,
          'assignment',
          assignment.assignmentId,
        );
      }
    }
    if (overdue.length > 0) this.logger.debug(`แจ้งเตือนทรัพย์สินเลยกำหนดคืน: ${overdue.length} รายการ`);
  }
}
