import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, In } from 'typeorm';
import { Movement } from './entities/movement.entity';
import { CreateMovementDto } from './dto/create-movement.dto';
import { QueryMovementDto } from './dto/query-movement.dto';
import { Employee } from '../employees/entities/employee.entity';
import { HolderType } from '@common/enums';

/**
 * Service กลางสำหรับเขียน audit trail — ทุก module ที่ทำให้ asset เปลี่ยนสถานะ/ที่อยู่/ผู้ถือครอง
 * (assignments, repairs, warranty, disposal, goods-receipt) ต้องเรียก log() หลัง commit การเปลี่ยนแปลง
 * ของตัวเองเสมอ เพื่อไม่ให้ endpoint ซ้ำซ้อนกันเอง (ตามที่ระบุใน Note ต้นไฟล์ DBML)
 */
@Injectable()
export class MovementsService {
  constructor(
    @InjectRepository(Movement) private repo: Repository<Movement>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
  ) {}

  /**
   * รับ `manager` ของ transaction ปัจจุบันได้ (optional) — ผู้เรียกที่อยู่ใน dataSource.transaction(...) อยู่แล้ว
   * (goods-receipt, assignments, repairs, warranty, disposal) ต้องส่ง manager นั้นเข้ามาเสมอ ไม่งั้น movement
   * จะถูก insert ผ่าน connection คนละตัวกับ transaction — ถ้า record ที่ movement อ้างถึง (เช่น asset ที่เพิ่งสร้าง)
   * ยังไม่ commit จะชน FK constraint ทันที และถ้า transaction หลัก rollback ทีหลัง movement log ก็จะไม่ rollback ตาม
   */
  log(dto: CreateMovementDto, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(Movement) : this.repo;
    return repo.save(repo.create(dto));
  }

  /**
   * to_holder_type/to_holder_id เป็น polymorphic FK (อ้างได้ทั้ง employees/departments/locations/vendors)
   * TypeORM ไม่รองรับ relation แบบนี้ตรงๆ — resolve เฉพาะกรณี EMPLOYEE (ใครเบิก/ยืมของไป) ให้เป็น object จริง
   * พร้อม department มาด้วย ส่วน DEPARTMENT/LOCATION/VENDOR ไม่ resolve เพิ่ม (ยังไม่มีหน้าไหนต้องใช้)
   * ยิง query เดียวแบบ batch (ไม่ query ทีละแถว) กัน N+1 ตอนมี movement เยอะ
   */
  private async attachToHolderEmployee<T extends Movement>(movements: T[]) {
    const employeeIds = [
      ...new Set(
        movements.filter((m) => m.toHolderType === HolderType.EMPLOYEE && m.toHolderId).map((m) => m.toHolderId!),
      ),
    ];
    if (employeeIds.length === 0) return movements.map((m) => ({ ...m, toHolderEmployee: null }));

    const employees = await this.employeeRepo.find({ where: { employeeId: In(employeeIds) }, relations: ['department'] });
    const byId = new Map(employees.map((e) => [e.employeeId, e]));

    return movements.map((m) => ({
      ...m,
      toHolderEmployee: m.toHolderType === HolderType.EMPLOYEE && m.toHolderId ? (byId.get(m.toHolderId) ?? null) : null,
    }));
  }

  async findByAsset(assetId: number) {
    const movements = await this.repo.find({
      where: { assetId },
      order: { createdAt: 'DESC' },
      relations: ['fromLocation', 'toLocation', 'performedByEmployee'],
    });
    return this.attachToHolderEmployee(movements);
  }

  /**
   * เดิม hardcode take:200 ไม่มี search/filter/pagination เลย — audit log จะยิ่งใช้งานยากขึ้นทุกวันที่ข้อมูลโต
   * ทุก relation ที่นี่เป็น ManyToOne (ไม่มี one-to-many) จึง leftJoinAndSelect + skip/take ในคิวรีเดียวได้เลย
   * ไม่เสี่ยง row-multiplication เหมือน requisitions.items/approvals (ดู comment ที่ RequisitionsService)
   */
  async findAll(query: QueryMovementDto) {
    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.asset', 'asset')
      .leftJoinAndSelect('m.fromLocation', 'fromLocation')
      .leftJoinAndSelect('m.toLocation', 'toLocation')
      .leftJoinAndSelect('m.performedByEmployee', 'performedByEmployee');

    if (query.search) {
      qb.andWhere(
        '(asset.assetName ILIKE :s OR asset.assetNo ILIKE :s OR performedByEmployee.fullName ILIKE :s OR m.notes ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.movementType) qb.andWhere('m.movementType = :movementType', { movementType: query.movementType });
    if (query.dateFrom) qb.andWhere('m.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('m.createdAt <= :dateTo', { dateTo: `${query.dateTo} 23:59:59` });

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.orderBy('m.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const data = await this.attachToHolderEmployee(rows);
    return { data, total, page, limit };
  }
}
