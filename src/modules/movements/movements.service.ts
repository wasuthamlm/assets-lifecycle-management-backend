import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, In } from 'typeorm';
import { Movement } from './entities/movement.entity';
import { CreateMovementDto } from './dto/create-movement.dto';
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

  async findAll() {
    const movements = await this.repo.find({
      order: { createdAt: 'DESC' },
      take: 200,
      relations: ['asset', 'fromLocation', 'toLocation', 'performedByEmployee'],
    });
    return this.attachToHolderEmployee(movements);
  }
}
