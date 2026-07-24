import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoodsReceipt } from './entities/goods-receipt.entity';
import { GoodsReceiptItem } from './entities/goods-receipt-item.entity';
import { Asset } from '../assets/entities/asset.entity';
import { PurchaseOrderItem } from '../purchasing/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../purchasing/entities/purchase-order.entity';
import { GoodsReceiptService } from './goods-receipt.service';
import { GoodsReceiptController } from './goods-receipt.controller';
import { StockModule } from '../stock/stock.module';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GoodsReceipt, GoodsReceiptItem, Asset, PurchaseOrderItem, PurchaseOrder]),
    StockModule,
    MovementsModule,
  ],
  controllers: [GoodsReceiptController],
  providers: [GoodsReceiptService],
  exports: [GoodsReceiptService, TypeOrmModule],
})
export class GoodsReceiptModule {}
