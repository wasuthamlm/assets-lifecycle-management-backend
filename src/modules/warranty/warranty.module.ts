import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warranty } from './entities/warranty.entity';
import { Asset } from '../assets/entities/asset.entity';
import { WarrantyService } from './warranty.service';
import { WarrantyController } from './warranty.controller';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [TypeOrmModule.forFeature([Warranty, Asset]), MovementsModule],
  controllers: [WarrantyController],
  providers: [WarrantyService],
  exports: [WarrantyService, TypeOrmModule],
})
export class WarrantyModule {}
