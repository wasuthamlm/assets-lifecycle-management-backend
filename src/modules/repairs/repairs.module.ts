import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repair } from './entities/repair.entity';
import { Asset } from '../assets/entities/asset.entity';
import { RepairsService } from './repairs.service';
import { RepairsController } from './repairs.controller';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [TypeOrmModule.forFeature([Repair, Asset]), MovementsModule],
  controllers: [RepairsController],
  providers: [RepairsService],
  exports: [RepairsService, TypeOrmModule],
})
export class RepairsModule {}
