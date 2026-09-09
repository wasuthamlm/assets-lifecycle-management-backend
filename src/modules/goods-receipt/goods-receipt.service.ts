import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptItem } from './entities/goods-receipt-item.entity';
import { Asset } from '../assets/entities/asset.entity';
import { PurchaseOrderItem } from '../purchasing/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../purchasing/entities/purchase-order.entity';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { QueryGoodsReceiptDto } from './dto/query-goods-receipt.dto';
import { AssetStatus, MovementType, PoStatus } from '@common/enums';
import { StockService } from '../stock/stock.service';
import { MovementsService } from '../movements/movements.service';

/**
 * รับของ = จุดที่ทำ 3 อย่างพร้อมกันใน transaction เดียว:
 * 1) สร้าง asset ใหม่ (serialized) หรือ adjust stock_levels (bulk) ต่อรายการ
 * 2) อัปเดต received_quantity ของ purchase_order_items + สถานะ PO (partially_received/received)
 * 3) เขียน movement log (received_to_stock) ต่อ asset ที่สร้างใหม่
 * บังคับ XOR ระหว่าง assetData กับ stockItemId ต่อ 1 รายการ ตรงกับ CHECK constraint ระดับ DB
 */
@Injectable()
export class GoodsReceiptService {
  constructor(
    @InjectRepository(GoodsReceipt) private receiptRepo: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptItem) private receiptItemRepo: Repository<GoodsReceiptItem>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    @InjectRepository(PurchaseOrderItem) private poItemRepo: Repository<PurchaseOrderItem>,
    @InjectRepository(PurchaseOrder) private poRepo: Repository<PurchaseOrder>,
    private stockService: StockService,
    private movementsService: MovementsService,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateGoodsReceiptDto, receivedBy: number) {
    return this.dataSource.transaction(async (manager) => {
      const receipt = manager.create(GoodsReceipt, {
        receiptNo: dto.receiptNo,
        poId: dto.poId,
        receiptDate: dto.receiptDate ? new Date(dto.receiptDate) : new Date(),
        receivedBy,
        locationId: dto.locationId,
        notes: dto.notes,
      });
      await manager.save(receipt);

      for (const itemDto of dto.items) {
        const hasAsset = !!itemDto.assetData;
        const hasStock = !!itemDto.stockItemId;
        if (hasAsset === hasStock) {
          throw new BadRequestException('แต่ละรายการต้องระบุ assetData หรือ stockItemId อย่างใดอย่างหนึ่งเท่านั้น');
        }

        let assetId: number | undefined;
        if (hasAsset) {
          const assetData = itemDto.assetData!;
          const asset = manager.create(Asset, {
            ...assetData,
            // ไม่ให้กรอกเอง — generate เป็น UUID ฝั่ง server เสมอ เหมือน AssetsService.create()
            assetNo: randomUUID(),
            purchaseDate: dto.receiptDate ? new Date(dto.receiptDate) : new Date(),
            warrantyExpireDate: assetData.warrantyExpireDate ? new Date(assetData.warrantyExpireDate) : null,
            currentStatus: AssetStatus.IN_STOCK,
            currentLocationId: dto.locationId,
            createdBy: receivedBy,
          });
          await manager.save(asset);
          assetId = asset.assetId;

          await this.movementsService.log(
            {
              assetId: asset.assetId,
              movementType: MovementType.RECEIVED_TO_STOCK,
              toLocationId: dto.locationId,
              referenceType: 'goods_receipt',
              referenceId: receipt.receiptId,
              performedBy: receivedBy,
            },
            manager,
          );
        } else {
          await this.stockService.adjust(
            {
              stockItemId: itemDto.stockItemId!,
              locationId: dto.locationId,
              delta: itemDto.receivedQuantity || 0,
            },
            manager,
          );
        }

        const receiptItem = manager.create(GoodsReceiptItem, {
          receiptId: receipt.receiptId,
          poItemId: itemDto.poItemId,
          assetId,
          stockItemId: hasStock ? itemDto.stockItemId : undefined,
          receivedQuantity: hasStock ? itemDto.receivedQuantity : undefined,
          conditionOnReceipt: itemDto.conditionOnReceipt,
        });
        await manager.save(receiptItem);

        if (itemDto.poItemId) {
          const poItem = await manager.findOne(PurchaseOrderItem, {
            where: { poItemId: itemDto.poItemId },
            lock: { mode: 'pessimistic_write' },
          });
          if (poItem) {
            const receivingNow = hasStock ? itemDto.receivedQuantity || 0 : 1;
            if (poItem.receivedQuantity + receivingNow > poItem.quantity) {
              throw new BadRequestException(
                `รับของเกินจำนวนที่สั่งซื้อ: รายการ poItemId ${poItem.poItemId} สั่ง ${poItem.quantity} รับไปแล้ว ${poItem.receivedQuantity} รับเพิ่มได้อีกไม่เกิน ${poItem.quantity - poItem.receivedQuantity}`,
              );
            }
            poItem.receivedQuantity += receivingNow;
            await manager.save(poItem);
          }
        }
      }

      if (dto.poId) {
        // ล็อกแถว PO เดียวกับที่ PurchasingService.updateStatus() ล็อก กันรับของเข้าคลังพร้อมกับแก้สถานะ PO
        // มือแข่งกันเขียนทับ — ไม่ join relations ตรงนี้เพราะ pessimistic lock กับ outer join ของ one-to-many
        // จะ error ใน Postgres จึงแยกอ่าน items เป็นอีก query ต่างหาก
        const po = await manager.findOne(PurchaseOrder, {
          where: { poId: dto.poId },
          lock: { mode: 'pessimistic_write' },
        });
        if (po) {
          const items = await manager.find(PurchaseOrderItem, { where: { poId: dto.poId } });
          const allReceived = items.every((i) => i.receivedQuantity >= i.quantity);
          const someReceived = items.some((i) => i.receivedQuantity > 0);
          po.status = allReceived ? PoStatus.RECEIVED : someReceived ? PoStatus.PARTIALLY_RECEIVED : po.status;
          await manager.save(po);
        }
      }

      // ต้องอ่านผ่าน manager (connection เดียวกับ transaction นี้) ไม่ใช่ this.receiptRepo ที่เป็นคนละ
      // connection — transaction ยังไม่ commit ตอนนี้ อ่านผ่าน connection อื่นจะไม่เห็นแถวที่เพิ่ง insert (คืน null)
      return manager.findOne(GoodsReceipt, { where: { receiptId: receipt.receiptId }, relations: ['items'] });
    });
  }

  /**
   * เดิม fetch ทั้งหมดไม่มี pagination/search — หน้า list ใช้แค่จำนวนรายการ (items.length) ไม่ได้ใช้
   * รายละเอียดแต่ละ item จึงใช้ loadRelationCountAndMap แทน leftJoinAndSelect('items', ...) ตรงๆ
   * (items เป็น OneToMany — join ตรงจะ multiply แถวจน skip/take/count ผิดเพี้ยนเหมือนที่เคยแก้ใน requisitions)
   */
  findAll(query: QueryGoodsReceiptDto) {
    const qb = this.receiptRepo
      .createQueryBuilder('gr')
      .leftJoinAndSelect('gr.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('gr.location', 'location')
      .loadRelationCountAndMap('gr.itemCount', 'gr.items');

    if (query.search) {
      qb.andWhere('(gr.receiptNo ILIKE :s OR purchaseOrder.poNo ILIKE :s)', { s: `%${query.search}%` });
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.orderBy('gr.receiptId', 'DESC').skip((page - 1) * limit).take(limit);

    return qb.getManyAndCount().then(([data, total]) => ({ data, total, page, limit }));
  }

  async findOne(id: number) {
    const r = await this.receiptRepo.findOne({
      where: { receiptId: id },
      relations: ['purchaseOrder', 'location', 'items', 'items.asset', 'items.stockItem'],
    });
    if (!r) throw new NotFoundException(`ไม่พบใบรับของ id ${id}`);
    return r;
  }
}
