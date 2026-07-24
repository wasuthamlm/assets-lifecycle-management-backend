import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesPermissionsService } from './roles-permissions.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { AssignPermissionsDto } from './dto/assign-permission.dto';
import { AssignRolesDto } from './dto/assign-role.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('roles-permissions')
@ApiBearerAuth()
@Controller()
export class RolesPermissionsController {
  constructor(private service: RolesPermissionsService) {}

  @Post('roles')
  @RequirePermissions('rbac.manage')
  createRole(@Body() dto: CreateRoleDto) {
    return this.service.createRole(dto);
  }

  @Get('roles')
  @RequirePermissions('rbac.manage')
  findAllRoles() {
    return this.service.findAllRoles();
  }

  @Get('roles/:id')
  @RequirePermissions('rbac.manage')
  findRole(@Param('id', ParseIntPipe) id: number) {
    return this.service.findRole(id);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('rbac.manage')
  assignPermissions(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignPermissionsDto) {
    return this.service.assignPermissionsToRole(id, dto);
  }

  @Post('permissions')
  @RequirePermissions('rbac.manage')
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.service.createPermission(dto);
  }

  @Get('permissions')
  @RequirePermissions('rbac.manage')
  findAllPermissions() {
    return this.service.findAllPermissions();
  }

  @Put('employees/:id/roles')
  @RequirePermissions('rbac.manage')
  assignRoles(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignRolesDto) {
    return this.service.assignRolesToEmployee(id, dto);
  }
}
