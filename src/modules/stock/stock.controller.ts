import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private service: StockService) {}

  @Post('items') @RequirePermissions('stock.manage')
  createItem(@Body() dto: CreateStockItemDto) { return this.service.createItem(dto); }

  @Get('items') @RequirePermissions('stock.view')
  findAllItems() { return this.service.findAllItems(); }

  @Get('items/:id') @RequirePermissions('stock.view')
  findItem(@Param('id', ParseIntPipe) id: number) { return this.service.findItem(id); }

  @Patch('items/:id') @RequirePermissions('stock.manage')
  updateItem(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStockItemDto) { return this.service.updateItem(id, dto); }

  @Get('levels/location/:locationId') @RequirePermissions('stock.view')
  levelsByLocation(@Param('locationId', ParseIntPipe) locationId: number) { return this.service.levelsByLocation(locationId); }

  @Post('levels/adjust') @RequirePermissions('stock.manage')
  adjust(@Body() dto: AdjustStockDto) { return this.service.adjust(dto); }
}
