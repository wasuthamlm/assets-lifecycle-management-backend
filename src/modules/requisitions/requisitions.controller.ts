import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequisitionsService } from './requisitions.service';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { ApproveRequisitionDto } from './dto/approve-requisition.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';

@ApiTags('requisitions')
@ApiBearerAuth()
@Controller('requisitions')
export class RequisitionsController {
  constructor(private service: RequisitionsService) {}

  @Post() @RequirePermissions('requisition.create')
  create(@Body() dto: CreateRequisitionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, requireEmployeeId(user));
  }

  @Get() @RequirePermissions('requisition.view_all')
  findAll() { return this.service.findAll(); }

  // preview เลขที่เอกสารถัดไปให้หน้าสร้างใบขอใช้แสดง — ใช้สิทธิ์เดียวกับการสร้าง ไม่ใช่ view_all
  @Get('next-no') @RequirePermissions('requisition.create')
  nextNo() { return this.service.peekNextRequisitionNo().then((requisitionNo) => ({ requisitionNo })); }

  @Get('mine') @RequirePermissions('requisition.view_own')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMine(requireEmployeeId(user));
  }

  @Get(':id') @RequirePermissions('requisition.view_own')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Post(':id/approve') @RequirePermissions('requisition.approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveRequisitionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.approve(id, dto, requireEmployeeId(user));
  }
}
