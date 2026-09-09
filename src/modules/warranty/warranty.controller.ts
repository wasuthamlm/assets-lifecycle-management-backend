import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WarrantyService } from './warranty.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { RenewWarrantyDto } from './dto/renew-warranty.dto';
import { QueryExpiringWarrantyDto } from './dto/query-expiring-warranty.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';

@ApiTags('warranty')
@ApiBearerAuth()
@Controller('warranties')
export class WarrantyController {
  constructor(private service: WarrantyService) {}

  @Post() @RequirePermissions('warranty.manage')
  create(@Body() dto: CreateWarrantyDto) { return this.service.create(dto); }

  // ต้องอยู่ก่อน @Get(':id') เสมอ ไม่งั้น Nest จะจับ '/warranties/expiring' เข้า route :id แล้ว
  // ParseIntPipe ตอน findOne พังเพราะ 'expiring' ไม่ใช่ตัวเลข
  @Get('expiring') @RequirePermissions('asset.view')
  findExpiring(@Query() query: QueryExpiringWarrantyDto) { return this.service.findExpiring(query.withinDays); }

  @Get('asset/:assetId') @RequirePermissions('asset.view')
  findByAsset(@Param('assetId', ParseIntPipe) assetId: number) { return this.service.findByAsset(assetId); }

  @Get(':id') @RequirePermissions('asset.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post(':id/renew') @RequirePermissions('warranty.manage')
  renew(@Param('id', ParseIntPipe) id: number, @Body() dto: RenewWarrantyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.renew(id, dto, requireEmployeeId(user));
  }
}
