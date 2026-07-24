import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GoodsReceiptService } from './goods-receipt.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('goods-receipt')
@ApiBearerAuth()
@Controller('goods-receipts')
export class GoodsReceiptController {
  constructor(private service: GoodsReceiptService) {}

  @Post() @RequirePermissions('goods_receipt.create')
  create(@Body() dto: CreateGoodsReceiptDto) { return this.service.create(dto); }

  @Get() @RequirePermissions('goods_receipt.view')
  findAll() { return this.service.findAll(); }

  @Get(':id') @RequirePermissions('goods_receipt.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
}
