import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
   * ถ้ายังไม่มีแถว stock_level ของ (stock_item, location) นี้ ให้สร้างใหม่เริ่มที่ 0 ก่อน
   */
  async adjust(dto: AdjustStockDto) {
    let level = await this.levelRepo.findOne({
      where: { stockItemId: dto.stockItemId, locationId: dto.locationId },
    });
    if (!level) {
      level = this.levelRepo.create({ stockItemId: dto.stockItemId, locationId: dto.locationId, quantityOnHand: 0 });
    }
    const newQty = level.quantityOnHand + dto.delta;
    if (newQty < 0) throw new BadRequestException('จำนวนคงเหลือจะติดลบ ไม่สามารถปรับได้');
    level.quantityOnHand = newQty;
    level.updatedAt = new Date();
    return this.levelRepo.save(level);
  }
}
