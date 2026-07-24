import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptItem } from './entities/goods-receipt-item.entity';
import { Asset } from '../assets/entities/asset.entity';
import { PurchaseOrderItem } from '../purchasing/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../purchasing/entities/purchase-order.entity';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
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

  async create(dto: CreateGoodsReceiptDto) {
    return this.dataSource.transaction(async (manager) => {
      const receipt = manager.create(GoodsReceipt, {
        receiptNo: dto.receiptNo,
        poId: dto.poId,
        receiptDate: dto.receiptDate ? new Date(dto.receiptDate) : new Date(),
        receivedBy: dto.receivedBy,
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
            purchaseDate: dto.receiptDate ? new Date(dto.receiptDate) : new Date(),
            warrantyExpireDate: assetData.warrantyExpireDate ? new Date(assetData.warrantyExpireDate) : null,
            currentStatus: AssetStatus.IN_STOCK,
            currentLocationId: dto.locationId,
            createdBy: dto.receivedBy,
          });
          await manager.save(asset);
          assetId = asset.assetId;

          await this.movementsService.log({
            assetId: asset.assetId,
            movementType: MovementType.RECEIVED_TO_STOCK,
            toLocationId: dto.locationId,
            referenceType: 'goods_receipt',
            referenceId: receipt.receiptId,
            performedBy: dto.receivedBy,
          });
        } else {
          await this.stockService.adjust({
            stockItemId: itemDto.stockItemId!,
            locationId: dto.locationId,
            delta: itemDto.receivedQuantity || 0,
          });
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
          const poItem = await manager.findOne(PurchaseOrderItem, { where: { poItemId: itemDto.poItemId } });
          if (poItem) {
            poItem.receivedQuantity += hasStock ? itemDto.receivedQuantity || 0 : 1;
            await manager.save(poItem);
          }
        }
      }

      if (dto.poId) {
        const po = await manager.findOne(PurchaseOrder, { where: { poId: dto.poId }, relations: ['items'] });
        if (po) {
          const allReceived = po.items.every((i) => i.receivedQuantity >= i.quantity);
          const someReceived = po.items.some((i) => i.receivedQuantity > 0);
          po.status = allReceived ? PoStatus.RECEIVED : someReceived ? PoStatus.PARTIALLY_RECEIVED : po.status;
          await manager.save(po);
        }
      }

      return this.receiptRepo.findOne({ where: { receiptId: receipt.receiptId }, relations: ['items'] });
    });
  }

  findAll() {
    return this.receiptRepo.find({ relations: ['purchaseOrder', 'location'], order: { receiptId: 'DESC' } });
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
