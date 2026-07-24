import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MovementsService } from './movements.service';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

/**
 * Movement เป็น audit trail แบบ append-only — ไม่มี create/update/delete endpoint สาธารณะ
 * แถวใหม่ถูก insert ผ่าน MovementsService.log() จาก service อื่นภายในระบบเท่านั้น
 */
@ApiTags('movements')
@ApiBearerAuth()
@Controller('movements')
export class MovementsController {
  constructor(private service: MovementsService) {}

  @Get()
  @RequirePermissions('asset.view')
  findAll() {
    return this.service.findAll();
  }

  @Get('asset/:assetId')
  @RequirePermissions('asset.view')
  findByAsset(@Param('assetId', ParseIntPipe) assetId: number) {
    return this.service.findByAsset(assetId);
  }
}
