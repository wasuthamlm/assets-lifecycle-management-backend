import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolePreassignmentsService } from './role-preassignments.service';
import { UpsertRolePreassignmentDto } from './dto/upsert-role-preassignment.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/auth.service';

@ApiTags('roles-permissions')
@ApiBearerAuth()
@Controller('role-preassignments')
export class RolePreassignmentsController {
  constructor(private service: RolePreassignmentsService) {}

  @Get()
  @RequirePermissions('rbac.manage')
  findAll() {
    return this.service.findAll();
  }

  // upsert ตามอีเมล — ส่งอีเมลเดิมซ้ำ = แก้ role ที่กำหนดไว้
  @Put()
  @RequirePermissions('rbac.manage')
  upsert(@Body() dto: UpsertRolePreassignmentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.upsert(dto, user.userId);
  }

  @Delete(':id')
  @RequirePermissions('rbac.manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
