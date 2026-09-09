import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GoodsReceiptService } from './goods-receipt.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { QueryGoodsReceiptDto } from './dto/query-goods-receipt.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';

@ApiTags('goods-receipt')
@ApiBearerAuth()
@Controller('goods-receipts')
export class GoodsReceiptController {
  constructor(private service: GoodsReceiptService) {}

  @Post() @RequirePermissions('goods_receipt.create')
  create(@Body() dto: CreateGoodsReceiptDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, requireEmployeeId(user));
  }

  @Get() @RequirePermissions('goods_receipt.view')
  findAll(@Query() query: QueryGoodsReceiptDto) { return this.service.findAll(query); }

  @Get(':id') @RequirePermissions('goods_receipt.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
}
