import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { PoStatus } from '@common/enums';
import { generateSequentialNumber } from '@common/utils/sequential-number.util';

/**
 * ลำดับสถานะ PO ที่อนุญาต — กันย้อนสถานะ/ข้ามขั้น (เช่น received -> draft, cancelled -> ordered)
 * cancelled/received เป็น terminal state (เปลี่ยนต่อไม่ได้อีก)
 */
const PO_STATUS_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  [PoStatus.DRAFT]: [PoStatus.ORDERED, PoStatus.CANCELLED],
  [PoStatus.ORDERED]: [PoStatus.PARTIALLY_RECEIVED, PoStatus.RECEIVED, PoStatus.CANCELLED],
  [PoStatus.PARTIALLY_RECEIVED]: [PoStatus.RECEIVED, PoStatus.CANCELLED],
  [PoStatus.RECEIVED]: [],
  [PoStatus.CANCELLED]: [],
};

@Injectable()
export class PurchasingService {
  constructor(
    @InjectRepository(PurchaseOrder) private poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem) private poItemRepo: Repository<PurchaseOrderItem>,
    private dataSource: DataSource,
  ) {}

  private generatePoNo(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    return generateSequentialNumber(manager, PurchaseOrder, 'poNo', `PO-${year}-`);
  }

  async create(dto: CreatePurchaseOrderDto, requestedBy: number) {
    return this.dataSource.transaction(async (manager) => {
      const totalAmount = dto.items.reduce((sum, i) => sum + i.quantity * (i.unitPrice || 0), 0);
      const poNo = await this.generatePoNo(manager);

      const po = manager.create(PurchaseOrder, {
        poNo,
        vendorId: dto.vendorId,
        orderDate: dto.orderDate ? new Date(dto.orderDate) : null,
        expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : null,
        requestedBy,
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

  async updateStatus(id: number, dto: UpdatePurchaseOrderStatusDto, approvedBy: number) {
    const po = await this.findOne(id);

    if (dto.status !== po.status) {
      const allowed = PO_STATUS_TRANSITIONS[po.status] || [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(`ไม่สามารถเปลี่ยนสถานะจาก '${po.status}' เป็น '${dto.status}' ได้`);
      }
    }

    po.status = dto.status;
    if (dto.status === PoStatus.ORDERED) po.approvedBy = approvedBy;
    return this.poRepo.save(po);
  }
}
