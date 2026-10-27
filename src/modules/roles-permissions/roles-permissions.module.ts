import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { EmployeeRole } from './entities/employee-role.entity';
import { RolePreassignment } from './entities/role-preassignment.entity';
import { Employee } from '../employees/entities/employee.entity';
import { User } from '../users/entities/user.entity';
import { RolesPermissionsService } from './roles-permissions.service';
import { RolesPermissionsController } from './roles-permissions.controller';
import { RolePreassignmentsService } from './role-preassignments.service';
import { RolePreassignmentsController } from './role-preassignments.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AllowedDomainsModule } from '../allowed-domains/allowed-domains.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, RolePermission, EmployeeRole, RolePreassignment, Employee, User]),
    NotificationsModule,
    AllowedDomainsModule,
  ],
  controllers: [RolesPermissionsController, RolePreassignmentsController],
  providers: [RolesPermissionsService, RolePreassignmentsService],
  exports: [RolesPermissionsService, RolePreassignmentsService, TypeOrmModule],
})
export class RolesPermissionsModule {}
