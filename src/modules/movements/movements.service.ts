import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Movement } from './entities/movement.entity';
import { CreateMovementDto } from './dto/create-movement.dto';

/**
 * Service กลางสำหรับเขียน audit trail — ทุก module ที่ทำให้ asset เปลี่ยนสถานะ/ที่อยู่/ผู้ถือครอง
 * (assignments, repairs, warranty, disposal, goods-receipt) ต้องเรียก log() หลัง commit การเปลี่ยนแปลง
 * ของตัวเองเสมอ เพื่อไม่ให้ endpoint ซ้ำซ้อนกันเอง (ตามที่ระบุใน Note ต้นไฟล์ DBML)
 */
@Injectable()
export class MovementsService {
  constructor(@InjectRepository(Movement) private repo: Repository<Movement>) {}

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

  findByAsset(assetId: number) {
    return this.repo.find({
      where: { assetId },
      order: { createdAt: 'DESC' },
      relations: ['fromLocation', 'toLocation', 'performedByEmployee'],
    });
  }

  findAll() {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: 200,
      relations: ['asset', 'fromLocation', 'toLocation', 'performedByEmployee'],
    });
  }
}
