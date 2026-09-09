import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Assignment } from './entities/assignment.entity';
import { Asset } from '../assets/entities/asset.entity';
import { Requisition } from '../requisitions/entities/requisition.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';
import { Location } from '../locations/entities/location.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { IssueAssetDto } from './dto/issue-asset.dto';
import { ReturnAssetDto } from './dto/return-asset.dto';
import { ApprovalStatus, AssetStatus, HolderType, MovementType, ReturnCondition } from '@common/enums';
import { MovementsService } from '../movements/movements.service';
import { assertAssetStatus } from '@common/utils/assert-asset-status.util';
import { isPastDueDateThai } from '@common/utils/thai-date.util';

/**
 * assignment = สถานะ "การถือครองปัจจุบัน" ของ asset หนึ่งชิ้น (มี due date/condition ตอนคืน)
 * ทุก issue/return ที่นี่จะ insert movement คู่กันเสมอ 1:1 ผ่าน MovementsService — ห้ามมี
 * endpoint อื่นแก้ current_holder_* ของ asset ตรงๆ นอกเหนือจากที่นี่ (กัน endpoint ซ้ำซ้อน)
 */
@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment) private repo: Repository<Assignment>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    @InjectRepository(Requisition) private requisitionRepo: Repository<Requisition>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(Department) private departmentRepo: Repository<Department>,
    @InjectRepository(Location) private locationRepo: Repository<Location>,
    @InjectRepository(Vendor) private vendorRepo: Repository<Vendor>,
    private movementsService: MovementsService,
    private dataSource: DataSource,
  ) {}

  /**
   * Resolve polymorphic holder (holderType + holderId) เป็น object จริง เหมือนที่ AssetsService.resolveHolder ทำ
   * — employee ดึง relation 'department' มาด้วยเพื่อโชว์แผนก/เบอร์โทรในหน้ารอรับคืน
   */
  private async resolveHolder(assignment: Assignment): Promise<any | null> {
    switch (assignment.holderType) {
      case HolderType.EMPLOYEE:
        return this.employeeRepo.findOne({ where: { employeeId: assignment.holderId }, relations: ['department'] });
      case HolderType.DEPARTMENT:
        return this.departmentRepo.findOne({ where: { departmentId: assignment.holderId } });
      case HolderType.LOCATION:
        return this.locationRepo.findOne({ where: { locationId: assignment.holderId } });
      case HolderType.VENDOR:
        return this.vendorRepo.findOne({ where: { vendorId: assignment.holderId } });
      default:
        return null;
    }
  }

  private async attachHolders(assignments: Assignment[]) {
    return Promise.all(
      assignments.map(async (a) => ({ ...a, holder: await this.resolveHolder(a) })),
    );
  }

  async issue(dto: IssueAssetDto, issuedBy: number) {
    return this.dataSource.transaction(async (manager) => {
      // pessimistic_write ล็อกแถว asset ตลอด transaction กัน 2 คำขอ issue asset เดียวกันพร้อมกัน
      // (เดิมเช็ค currentStatus ก่อนเปิด transaction แบบ read-then-write ทำให้ 2 request ที่มาพร้อมกัน
      // อ่านเห็น IN_STOCK เหมือนกันทั้งคู่แล้ว commit ผ่านทั้งคู่ — asset ถูกจ่ายให้ 2 คนซ้อนกันได้)
      const asset = await manager.findOne(Asset, {
        where: { assetId: dto.assetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${dto.assetId}`);
      assertAssetStatus(asset, [AssetStatus.IN_STOCK], 'เบิก/ยืมทรัพย์สินนี้');

      if (dto.requisitionId) {
        const requisition = await manager.findOne(Requisition, {
          where: { requisitionId: dto.requisitionId },
          relations: ['items'],
        });
        if (!requisition) throw new NotFoundException(`ไม่พบใบขอเบิก/ยืม id ${dto.requisitionId}`);
        if (requisition.overallStatus !== ApprovalStatus.APPROVED) {
          throw new ConflictException('ใบขอเบิก/ยืมนี้ยังไม่ได้รับการอนุมัติ ไม่สามารถจ่ายทรัพย์สินอ้างอิงใบนี้ได้');
        }
        const matchesItem = requisition.items.some((i) => i.assetId === dto.assetId);
        if (!matchesItem) {
          throw new BadRequestException('ทรัพย์สินนี้ไม่ได้อยู่ในรายการของใบขอเบิก/ยืมที่ระบุ');
        }
      }

      const assignment = manager.create(Assignment, {
        assetId: dto.assetId,
        requisitionId: dto.requisitionId,
        assignmentType: dto.assignmentType,
        holderType: dto.holderType,
        holderId: dto.holderId,
        issuedDate: new Date(),
        issuedBy,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes,
      });
      await manager.save(assignment);

      const fromLocationId = asset.currentLocationId;
      const fromHolderType = asset.currentHolderType;
      const fromHolderId = asset.currentHolderId;

      asset.currentStatus = AssetStatus.ASSIGNED;
      asset.currentHolderType = dto.holderType;
      asset.currentHolderId = dto.holderId;
      await manager.save(asset);

      await this.movementsService.log(
        {
          assetId: asset.assetId,
          movementType: MovementType.ISSUED,
          fromLocationId,
          toLocationId: asset.currentLocationId,
          fromHolderType,
          fromHolderId,
          toHolderType: dto.holderType,
          toHolderId: dto.holderId,
          referenceType: 'assignment',
          referenceId: assignment.assignmentId,
          performedBy: issuedBy,
          notes: dto.notes,
        },
        manager,
      );

      return assignment;
    });
  }

  async return_(assignmentId: number, dto: ReturnAssetDto, receivedBy: number) {
    return this.dataSource.transaction(async (manager) => {
      // ล็อก assignment ก่อนเช็ค returnedDate กัน 2 คำขอคืนพร้อมกันผ่าน check ทั้งคู่ (double-return)
      const assignment = await manager.findOne(Assignment, {
        where: { assignmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment) throw new NotFoundException(`ไม่พบ assignment id ${assignmentId}`);
      if (assignment.returnedDate) throw new BadRequestException('assignment นี้ถูกคืนไปแล้ว');

      const asset = await manager.findOne(Asset, {
        where: { assetId: assignment.assetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!asset) throw new NotFoundException(`ไม่พบทรัพย์สิน id ${assignment.assetId}`);

      assignment.returnedDate = new Date();
      assignment.receivedBy = receivedBy;
      assignment.returnCondition = dto.returnCondition;
      // เทียบวันที่ปฏิทินไทยของวันคืนจริงกับ dueDate (ไม่ใช่ timestamp ตรงๆ) — Postgres session ในระบบนี้ตั้ง
      // TZ เป็น UTC ต่างจากเวลาไทยที่ธุรกิจใช้จริง ถ้าเทียบ timestamp ดิบๆ จะเพี้ยนไปหนึ่งวันช่วง 00:00-06:59
      // เวลาไทยทุกวัน จึง anchor เข้ากับ Asia/Bangkok เสมอผ่าน isPastDueDateThai (จุดเดียวกับที่ cron ใช้)
      assignment.isLateReturn = !!assignment.dueDate && isPastDueDateThai(assignment.dueDate, assignment.returnedDate);
      if (dto.notes) assignment.notes = dto.notes;
      await manager.save(assignment);

      const fromHolderType = asset.currentHolderType;
      const fromHolderId = asset.currentHolderId;

      asset.currentStatus =
        dto.returnCondition === ReturnCondition.LOST ? AssetStatus.DISPOSED : AssetStatus.IN_STOCK;
      asset.currentHolderType = null;
      asset.currentHolderId = null;
      await manager.save(asset);

      await this.movementsService.log(
        {
          assetId: asset.assetId,
          movementType: MovementType.RETURNED,
          fromHolderType,
          fromHolderId,
          referenceType: 'assignment',
          referenceId: assignment.assignmentId,
          performedBy: receivedBy,
          notes: `คืนสภาพ: ${dto.returnCondition}${assignment.isLateReturn ? ' (คืนล่าช้ากว่ากำหนด)' : ''}${dto.notes ? ' — ' + dto.notes : ''}`,
        },
        manager,
      );

      return assignment;
    });
  }

  async findByAsset(assetId: number) {
    const assignments = await this.repo.find({ where: { assetId }, order: { issuedDate: 'DESC' } });
    return this.attachHolders(assignments);
  }

  /** ทรัพย์สินที่ยังไม่ถูกคืนทั้งหมด — คิวสำหรับทีม IT รับของคืน เรียงตามกำหนดคืนใกล้สุดก่อน (เกินกำหนดขึ้นก่อน) */
  async findPendingReturns() {
    const assignments = await this.repo.find({
      where: { returnedDate: IsNull() },
      relations: ['asset', 'issuedByEmployee'],
      order: { dueDate: 'ASC', issuedDate: 'ASC' },
    });
    return this.attachHolders(assignments);
  }

  /** ทรัพย์สินที่ employee คนนี้ถือครองอยู่ตอนนี้ (ยังไม่คืน) — ดึง category/location ของ asset มาด้วยให้พอแสดงหน้า "รายการของฉัน" ได้ */
  findMine(employeeId: number) {
    return this.repo.find({
      where: { holderType: HolderType.EMPLOYEE, holderId: employeeId, returnedDate: IsNull() },
      relations: ['asset', 'asset.category', 'asset.currentLocation'],
      order: { issuedDate: 'DESC' },
    });
  }

  async findOne(id: number) {
    const a = await this.repo.findOne({ where: { assignmentId: id } });
    if (!a) throw new NotFoundException(`ไม่พบ assignment id ${id}`);
    return { ...a, holder: await this.resolveHolder(a) };
  }
}
