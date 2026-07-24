import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PurchasingService } from './purchasing.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchasingController {
  constructor(private service: PurchasingService) {}

  @Post() @RequirePermissions('po.create')
  create(@Body() dto: CreatePurchaseOrderDto) { return this.service.create(dto); }

  @Get() @RequirePermissions('po.view')
  findAll() { return this.service.findAll(); }

  @Get(':id') @RequirePermissions('po.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Patch(':id/status') @RequirePermissions('po.approve')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePurchaseOrderStatusDto) {
    return this.service.updateStatus(id, dto);
  }
}
