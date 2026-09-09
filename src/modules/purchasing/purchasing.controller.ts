import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PurchasingService } from './purchasing.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchasingController {
  constructor(private service: PurchasingService) {}

  @Post() @RequirePermissions('po.create')
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, requireEmployeeId(user));
  }

  @Get() @RequirePermissions('po.view')
  findAll(@Query() query: QueryPurchaseOrderDto) { return this.service.findAll(query); }

  @Get(':id') @RequirePermissions('po.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Patch(':id/status') @RequirePermissions('po.approve')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateStatus(id, dto, requireEmployeeId(user));
  }
}
