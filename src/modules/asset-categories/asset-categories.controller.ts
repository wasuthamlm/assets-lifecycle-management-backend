import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssetCategoriesService } from './asset-categories.service';
import { CreateAssetCategoryDto } from './dto/create-asset-category.dto';
import { UpdateAssetCategoryDto } from './dto/update-asset-category.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('asset-categories')
@ApiBearerAuth()
@Controller('asset-categories')
export class AssetCategoriesController {
  constructor(private service: AssetCategoriesService) {}

  @Post() @RequirePermissions('master.manage')
  create(@Body() dto: CreateAssetCategoryDto) { return this.service.create(dto); }

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Patch(':id') @RequirePermissions('master.manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssetCategoryDto) { return this.service.update(id, dto); }

  @Delete(':id') @RequirePermissions('master.manage')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
