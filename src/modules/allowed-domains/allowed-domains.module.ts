import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllowedDomain } from './entities/allowed-domain.entity';
import { AllowedDomainsService } from './allowed-domains.service';
import { AllowedDomainsController } from './allowed-domains.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AllowedDomain])],
  controllers: [AllowedDomainsController],
  providers: [AllowedDomainsService],
  exports: [AllowedDomainsService, TypeOrmModule],
})
export class AllowedDomainsModule {}
