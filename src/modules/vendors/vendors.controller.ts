import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('vendors')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private service: VendorsService) {}

  @Post() @RequirePermissions('master.manage')
  create(@Body() dto: CreateVendorDto) { return this.service.create(dto); }

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Patch(':id') @RequirePermissions('master.manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVendorDto) { return this.service.update(id, dto); }

  @Delete(':id') @RequirePermissions('master.manage')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
