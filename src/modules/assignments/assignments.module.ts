import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from './entities/assignment.entity';
import { Asset } from '../assets/entities/asset.entity';
import { Requisition } from '../requisitions/entities/requisition.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';
import { Location } from '../locations/entities/location.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Assignment, Asset, Requisition, Employee, Department, Location, Vendor]),
    MovementsModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService, TypeOrmModule],
})
export class AssignmentsModule {}
