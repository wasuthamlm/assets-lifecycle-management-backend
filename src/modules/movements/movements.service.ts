import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  log(dto: CreateMovementDto) {
    return this.repo.save(this.repo.create(dto));
  }

  findByAsset(assetId: number) {
    return this.repo.find({
      where: { assetId },
      order: { createdAt: 'DESC' },
      relations: ['fromLocation', 'toLocation', 'performedByEmployee'],
    });
  }

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }
}
