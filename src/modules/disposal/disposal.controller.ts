import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DisposalService } from './disposal.service';
import { CreateDisposalDto } from './dto/create-disposal.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('disposal')
@ApiBearerAuth()
@Controller('disposals')
export class DisposalController {
  constructor(private service: DisposalService) {}

  @Post() @RequirePermissions('disposal.create')
  create(@Body() dto: CreateDisposalDto) { return this.service.create(dto); }

  @Get() @RequirePermissions('disposal.view')
  findAll() { return this.service.findAll(); }

  @Get(':id') @RequirePermissions('disposal.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
}
