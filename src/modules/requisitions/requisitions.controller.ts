import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequisitionsService } from './requisitions.service';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { ApproveRequisitionDto } from './dto/approve-requisition.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('requisitions')
@ApiBearerAuth()
@Controller('requisitions')
export class RequisitionsController {
  constructor(private service: RequisitionsService) {}

  @Post() @RequirePermissions('requisition.create')
  create(@Body() dto: CreateRequisitionDto) { return this.service.create(dto); }

  @Get() @RequirePermissions('requisition.view_all')
  findAll() { return this.service.findAll(); }

  @Get(':id') @RequirePermissions('requisition.view_own')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post(':id/approve') @RequirePermissions('requisition.approve')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveRequisitionDto) {
    return this.service.approve(id, dto);
  }
}
