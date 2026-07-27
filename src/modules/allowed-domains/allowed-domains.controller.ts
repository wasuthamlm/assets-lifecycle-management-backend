import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AllowedDomainsService } from './allowed-domains.service';
import { CreateAllowedDomainDto } from './dto/create-allowed-domain.dto';
import { UpdateAllowedDomainDto } from './dto/update-allowed-domain.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('allowed-domains')
@ApiBearerAuth()
@Controller('allowed-domains')
export class AllowedDomainsController {
  constructor(private service: AllowedDomainsService) {}

  @Post()
  @RequirePermissions('master.manage')
  create(@Body() dto: CreateAllowedDomainDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('master.manage')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('master.manage')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('master.manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAllowedDomainDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('master.manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
