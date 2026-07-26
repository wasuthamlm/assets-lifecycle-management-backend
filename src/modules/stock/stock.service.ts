import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StockItem } from './entities/stock-item.entity';
import { StockLevel } from './entities/stock-level.entity';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockItem) private itemRepo: Repository<StockItem>,
    @InjectRepository(StockLevel) private levelRepo: Repository<StockLevel>,
    private dataSource: DataSource,
  ) {}

  createItem(dto: CreateStockItemDto) {
    return this.itemRepo.save(this.itemRepo.create(dto));
  }

  findAllItems() {
    return this.itemRepo.find({ relations: ['category'] });
  }

  async findItem(id: number) {
    const item = await this.itemRepo.findOne({ where: { stockItemId: id }, relations: ['stockLevels', 'stockLevels.location'] });
    if (!item) throw new NotFoundException(`ไม่พบ stock item id ${id}`);
    return item;
  }

  async updateItem(id: number, dto: UpdateStockItemDto) {
    const item = await this.findItem(id);
    Object.assign(item, dto);
    return this.itemRepo.save(item);
  }

  levelsByLocation(locationId: number) {
    return this.levelRepo.find({ where: { locationId }, relations: ['stockItem'] });
  }

  /**
   * ปรับจำนวนคงเหลือแบบ atomic (ใช้ตอนรับของเข้า / เบิกออก / โอนย้าย)
   * เดิมเป็น read-then-write ธรรมดา (ไม่ atomic) — 2 คำขอปรับสต๊อกชิ้นเดียวกันพร้อมกันจะเกิด lost update
   * แก้ด้วย: insert แถว stock_level เริ่มที่ 0 ด้วย ON CONFLICT DO NOTHING (กันชนกันตอนแถวยังไม่มี)
   * แล้วค่อย SELECT...FOR UPDATE ล็อกแถวจริงก่อนคำนวณ/บันทึกจำนวนใหม่
   *
   * ถ้าผู้เรียกอยู่ใน transaction ของตัวเองอยู่แล้ว (เช่น goods-receipt) ให้ส่ง `manager` เข้ามาเพื่อรวมอยู่ใน
   * transaction เดียวกัน ถ้าไม่ส่งมา จะเปิด transaction ใหม่ของตัวเอง
   */
  adjust(dto: AdjustStockDto, manager?: EntityManager) {
    if (manager) return this.adjustWithManager(manager, dto);
    return this.dataSource.transaction((txManager) => this.adjustWithManager(txManager, dto));
  }

  private async adjustWithManager(manager: EntityManager, dto: AdjustStockDto) {
    const repo = manager.getRepository(StockLevel);

    await repo
      .createQueryBuilder()
      .insert()
      .into(StockLevel)
      .values({ stockItemId: dto.stockItemId, locationId: dto.locationId, quantityOnHand: 0 })
      .orIgnore()
      .execute();

    const level = await repo.findOne({
      where: { stockItemId: dto.stockItemId, locationId: dto.locationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!level) throw new NotFoundException('ไม่พบ stock level หลังพยายามสร้าง');

    const newQty = level.quantityOnHand + dto.delta;
    if (newQty < 0) throw new BadRequestException('จำนวนคงเหลือจะติดลบ ไม่สามารถปรับได้');
    level.quantityOnHand = newQty;
    level.updatedAt = new Date();
    return repo.save(level);
  }
}
