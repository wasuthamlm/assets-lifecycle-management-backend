import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movement } from './entities/movement.entity';
import { Employee } from '../employees/entities/employee.entity';
import { MovementsService } from './movements.service';
import { MovementsController } from './movements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Movement, Employee])],
  controllers: [MovementsController],
  providers: [MovementsService],
  exports: [MovementsService, TypeOrmModule],
})
export class MovementsModule {}
