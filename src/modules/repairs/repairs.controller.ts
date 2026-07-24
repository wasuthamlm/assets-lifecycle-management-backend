import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RepairsService } from './repairs.service';
import { CreateRepairDto } from './dto/create-repair.dto';
import { UpdateRepairStatusDto } from './dto/update-repair-status.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('repairs')
@ApiBearerAuth()
@Controller('repairs')
export class RepairsController {
  constructor(private service: RepairsService) {}

  @Post() @RequirePermissions('repair.create')
  create(@Body() dto: CreateRepairDto) { return this.service.create(dto); }

  @Get() @RequirePermissions('repair.view')
  findAll() { return this.service.findAll(); }

  @Get(':id') @RequirePermissions('repair.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Patch(':id/status') @RequirePermissions('repair.update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRepairStatusDto) {
    return this.service.updateStatus(id, dto);
  }
}
