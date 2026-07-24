import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WarrantyService } from './warranty.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { RenewWarrantyDto } from './dto/renew-warranty.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('warranty')
@ApiBearerAuth()
@Controller('warranties')
export class WarrantyController {
  constructor(private service: WarrantyService) {}

  @Post() @RequirePermissions('warranty.manage')
  create(@Body() dto: CreateWarrantyDto) { return this.service.create(dto); }

  @Get('asset/:assetId') @RequirePermissions('asset.view')
  findByAsset(@Param('assetId', ParseIntPipe) assetId: number) { return this.service.findByAsset(assetId); }

  @Get(':id') @RequirePermissions('asset.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post(':id/renew') @RequirePermissions('warranty.manage')
  renew(@Param('id', ParseIntPipe) id: number, @Body() dto: RenewWarrantyDto) { return this.service.renew(id, dto); }
}
