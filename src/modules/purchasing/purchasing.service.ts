import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { PoStatus } from '@common/enums';

@Injectable()
export class PurchasingService {
  constructor(
    @InjectRepository(PurchaseOrder) private poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem) private poItemRepo: Repository<PurchaseOrderItem>,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreatePurchaseOrderDto) {
    return this.dataSource.transaction(async (manager) => {
      const totalAmount = dto.items.reduce((sum, i) => sum + i.quantity * (i.unitPrice || 0), 0);

      const po = manager.create(PurchaseOrder, {
        poNo: dto.poNo,
        vendorId: dto.vendorId,
        orderDate: dto.orderDate ? new Date(dto.orderDate) : null,
        expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : null,
        requestedBy: dto.requestedBy,
        status: PoStatus.DRAFT,
        totalAmount,
      });
      await manager.save(po);

      const items = dto.items.map((i) =>
        manager.create(PurchaseOrderItem, { ...i, poId: po.poId, receivedQuantity: 0 }),
      );
      await manager.save(items);

      po.items = items;
      return po;
    });
  }

  findAll() {
    return this.poRepo.find({ relations: ['vendor', 'items'], order: { poId: 'DESC' } });
  }

  async findOne(id: number) {
    const po = await this.poRepo.findOne({ where: { poId: id }, relations: ['vendor', 'items', 'items.category'] });
    if (!po) throw new NotFoundException(`ไม่พบใบสั่งซื้อ id ${id}`);
    return po;
  }

  async updateStatus(id: number, dto: UpdatePurchaseOrderStatusDto) {
    const po = await this.findOne(id);
    po.status = dto.status;
    if (dto.approvedBy) po.approvedBy = dto.approvedBy;
    return this.poRepo.save(po);
  }
}
