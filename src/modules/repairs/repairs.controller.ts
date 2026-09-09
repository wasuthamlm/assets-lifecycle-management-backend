import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RepairsService } from './repairs.service';
import { CreateRepairDto } from './dto/create-repair.dto';
import { UpdateRepairStatusDto } from './dto/update-repair-status.dto';
import { QueryRepairDto } from './dto/query-repair.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';

@ApiTags('repairs')
@ApiBearerAuth()
@Controller('repairs')
export class RepairsController {
  constructor(private service: RepairsService) {}

  @Post() @RequirePermissions('repair.create')
  create(@Body() dto: CreateRepairDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, requireEmployeeId(user));
  }

  @Get() @RequirePermissions('repair.view')
  findAll(@Query() query: QueryRepairDto) { return this.service.findAll(query); }

  @Get(':id') @RequirePermissions('repair.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Patch(':id/status') @RequirePermissions('repair.update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRepairStatusDto) {
    return this.service.updateStatus(id, dto);
  }
}
