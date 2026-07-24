import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disposal } from './entities/disposal.entity';
import { Asset } from '../assets/entities/asset.entity';
import { DisposalService } from './disposal.service';
import { DisposalController } from './disposal.controller';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [TypeOrmModule.forFeature([Disposal, Asset]), MovementsModule],
  controllers: [DisposalController],
  providers: [DisposalService],
  exports: [DisposalService, TypeOrmModule],
})
export class DisposalModule {}
