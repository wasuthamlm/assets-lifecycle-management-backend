import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../roles-permissions/entities/role.entity';
import { EmployeeRole } from '../roles-permissions/entities/employee-role.entity';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, User, Role, EmployeeRole]), MailModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService, TypeOrmModule],
})
export class EmployeesModule {}
