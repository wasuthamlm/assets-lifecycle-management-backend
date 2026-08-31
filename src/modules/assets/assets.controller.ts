import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { QueryAssetDto } from './dto/query-asset.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('assets')
@ApiBearerAuth()
@Controller('assets')
export class AssetsController {
  constructor(private service: AssetsService) {}

  @Post()
  @RequirePermissions('asset.create')
  create(@Body() dto: CreateAssetDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('asset.view')
  findAll(@Query() query: QueryAssetDto) {
    return this.service.findAll(query);
  }

  // ต้องอยู่ก่อน @Get(':id') — ไม่งั้น ParseIntPipe ของ :id จะรับ "brands" ไปแปลงเป็น number ไม่ได้ก่อน
  @Get('brands')
  @RequirePermissions('asset.view')
  getBrands() {
    return this.service.getBrands();
  }

  @Get(':id')
  @RequirePermissions('asset.view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneWithHolder(id);
  }

  @Patch(':id')
  @RequirePermissions('asset.update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssetDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('asset.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
