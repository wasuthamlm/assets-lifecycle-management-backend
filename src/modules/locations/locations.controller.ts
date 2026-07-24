import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private service: LocationsService) {}

  @Post() @RequirePermissions('master.manage')
  create(@Body() dto: CreateLocationDto) { return this.service.create(dto); }

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Patch(':id') @RequirePermissions('master.manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto) { return this.service.update(id, dto); }

  @Delete(':id') @RequirePermissions('master.manage')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
