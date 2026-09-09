import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
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

  /**
   * เดิม fetch ทั้งหมดไม่มี pagination/search — แบ่งเป็น 2 รอบเหมือน RequisitionsService.queryWithFilters():
   * รอบแรกกรอง/นับ/แบ่งหน้าบน PO ล้วนๆ (ไม่ join items เข้ามาตอนนี้ เพราะ items เป็น OneToMany — join ตรงนี้
   * จะ multiply แถวทำให้ skip/take/count ผิดเพี้ยน) รอบสองค่อยดึง items เต็มเฉพาะ id ที่ได้จากหน้านี้เท่านั้น
   * ต้องคง items ไว้ในผลลัพธ์เพราะ GoodsReceiptForm.tsx ใช้ po.items เลือกรายการที่จะรับของอ้างอิง PO
   */
  async findAll(query: QueryPurchaseOrderDto) {
    const qb = this.poRepo.createQueryBuilder('po').leftJoinAndSelect('po.vendor', 'vendor');

    if (query.search) {
      qb.andWhere('(po.poNo ILIKE :s OR vendor.vendorName ILIKE :s)', { s: `%${query.search}%` });
    }
    if (query.status) qb.andWhere('po.status = :status', { status: query.status });

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.orderBy('po.poId', 'DESC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    if (rows.length === 0) return { data: [], total, page, limit };

    const ids = rows.map((po) => po.poId);
    const withItems = await this.poRepo.find({
      where: { poId: In(ids) },
      relations: ['vendor', 'items', 'items.category'],
      order: { poId: 'DESC' },
    });
    return { data: withItems, total, page, limit };
  }

  async findOne(id: number) {
    const po = await this.poRepo.findOne({ where: { poId: id }, relations: ['vendor', 'items', 'items.category'] });
    if (!po) throw new NotFoundException(`ไม่พบใบสั่งซื้อ id ${id}`);
    return po;
  }

  async updateStatus(id: number, dto: UpdatePurchaseOrderStatusDto, approvedBy: number) {
    return this.dataSource.transaction(async (manager) => {
      // ล็อกแถว PO ตลอด transaction กันสองคำขอเปลี่ยนสถานะพร้อมกัน (ดับเบิลคลิก/สอง admin) แข่งกัน
      // อ่านสถานะเดิมเหมือนกันแล้ว save ทับกันเงียบๆ — เหมือนแพทเทิร์นที่ใช้แก้ RequisitionsService.approve()
      // ไม่ join relations ตรงนี้เพราะ pessimistic lock กับ outer join ของ one-to-many จะ error ใน Postgres
      const po = await manager.findOne(PurchaseOrder, {
        where: { poId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!po) throw new NotFoundException(`ไม่พบใบสั่งซื้อ id ${id}`);

      if (dto.status !== po.status) {
        const allowed = PO_STATUS_TRANSITIONS[po.status] || [];
        if (!allowed.includes(dto.status)) {
          throw new BadRequestException(`ไม่สามารถเปลี่ยนสถานะจาก '${po.status}' เป็น '${dto.status}' ได้`);
        }
      }

      po.status = dto.status;
      if (dto.status === PoStatus.ORDERED) po.approvedBy = approvedBy;
      return manager.save(po);
    });
  }
}
