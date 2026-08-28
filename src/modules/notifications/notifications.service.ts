import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Subject, filter, map } from 'rxjs';
import { Notification } from './entities/notification.entity';
import { Employee } from '../employees/entities/employee.entity';
import { NotificationType } from '@common/enums';
import { MailService } from '../mail/mail.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  // Stream ของ notification ที่เพิ่งสร้างสำเร็จ ให้ controller filter ตาม recipientEmployeeId แล้ว push ผ่าน SSE
  // อยู่ในหน่วยความจำของ instance เดียว — ถ้า scale เกิน 1 instance ต้องเปลี่ยนไปใช้ pub/sub กลาง (เช่น Redis) แทน
  private readonly events$ = new Subject<Notification>();

  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    private mailService: MailService,
  ) {}

  /** ใช้จาก controller เพื่อ subscribe เฉพาะการแจ้งเตือนของพนักงานคนนั้นๆ */
  streamFor(employeeId: number) {
    return this.events$.pipe(
      filter((n) => n.recipientEmployeeId === employeeId),
      map((n) => ({ data: n })),
    );
  }

  /**
   * เรียกหลังจาก business operation หลัก (สร้าง/อนุมัติใบขอ, cron) commit ไปแล้วเสมอ — ทั้งก้อนนี้
   * ต้อง best-effort เหมือน mail: ถ้าล้มเหลว (DB ชั่วคราว, ฯลฯ) log แล้ว return null แทนที่จะ throw
   * ไม่งั้น operation ที่ commit ไปแล้วจริงจะโดนรายงานเป็น 500 ทั้งที่สำเร็จ
   */
  async notify(
    recipientEmployeeId: number,
    type: NotificationType,
    title: string,
    message: string,
    referenceType?: string,
    referenceId?: number,
  ): Promise<Notification | null> {
    try {
      const notification = await this.repo.save(
        this.repo.create({
          recipientEmployeeId,
          type,
          title,
          message,
          referenceType: referenceType ?? null,
          referenceId: referenceId ?? null,
        }),
      );

      this.events$.next(notification);

      const recipient = await this.employeeRepo.findOne({ where: { employeeId: recipientEmployeeId } });
      if (recipient?.email) {
        await this.mailService.send(recipient.email, title, message);
      }

      return notification;
    } catch (err) {
      this.logger.warn(`สร้างการแจ้งเตือนไม่สำเร็จ (recipient=${recipientEmployeeId}, type=${type}): ${(err as Error).message}`);
      return null;
    }
  }

  // ซ่อนการแจ้งเตือนที่ถูก "เคลียร์" ทิ้ง (dismissedAt) และที่เก่าเกิน 7 วันออกจากรายการที่เห็น —
  // ไม่ลบแถวจริงออกจาก DB เก็บไว้เป็นประวัติเสมอ (ดูคอมเมนต์ที่ Notification.dismissedAt)
  findMine(employeeId: number, unreadOnly = false) {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.recipientEmployeeId = :employeeId', { employeeId })
      .andWhere('n.dismissedAt IS NULL')
      .andWhere("n.createdAt >= now() - interval '7 days'")
      .orderBy('n.createdAt', 'DESC')
      .take(50);

    if (unreadOnly) qb.andWhere('n.isRead = false');

    return qb.getMany();
  }

  unreadCount(employeeId: number) {
    return this.repo
      .createQueryBuilder('n')
      .where('n.recipientEmployeeId = :employeeId', { employeeId })
      .andWhere('n.isRead = false')
      .andWhere('n.dismissedAt IS NULL')
      .andWhere("n.createdAt >= now() - interval '7 days'")
      .getCount();
  }

  async markRead(id: number, employeeId: number) {
    const notification = await this.repo.findOne({ where: { notificationId: id } });
    if (!notification) throw new NotFoundException(`ไม่พบการแจ้งเตือน id ${id}`);
    if (notification.recipientEmployeeId !== employeeId) {
      throw new ForbiddenException('ไม่สามารถแก้ไขการแจ้งเตือนของผู้อื่นได้');
    }
    notification.isRead = true;
    return this.repo.save(notification);
  }

  async markAllRead(employeeId: number) {
    await this.repo.update({ recipientEmployeeId: employeeId, isRead: false }, { isRead: true });
    return { success: true };
  }

  /** "ลบ" ทิ้งจากมุมมองผู้ใช้ — ซ่อนจากรายการเฉยๆ ไม่ได้ลบแถวจริง (ดู findMine) */
  async dismiss(id: number, employeeId: number) {
    const notification = await this.repo.findOne({ where: { notificationId: id } });
    if (!notification) throw new NotFoundException(`ไม่พบการแจ้งเตือน id ${id}`);
    if (notification.recipientEmployeeId !== employeeId) {
      throw new ForbiddenException('ไม่สามารถแก้ไขการแจ้งเตือนของผู้อื่นได้');
    }
    notification.dismissedAt = new Date();
    return this.repo.save(notification);
  }

  async dismissAll(employeeId: number) {
    await this.repo.update({ recipientEmployeeId: employeeId, dismissedAt: IsNull() }, { dismissedAt: new Date() });
    return { success: true };
  }

  /** ใช้จาก cron กันแจ้งเตือนซ้ำในวันเดียวกัน — เช็คว่ามี notification ชนิด+reference นี้ถูกสร้างวันนี้แล้วหรือยัง */
  async alreadyNotifiedToday(recipientEmployeeId: number, type: NotificationType, referenceId: number) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const count = await this.repo
      .createQueryBuilder('n')
      .where('n.recipientEmployeeId = :recipientEmployeeId', { recipientEmployeeId })
      .andWhere('n.type = :type', { type })
      .andWhere('n.referenceId = :referenceId', { referenceId })
      .andWhere('n.createdAt >= :startOfToday', { startOfToday })
      .getCount();

    return count > 0;
  }
}
