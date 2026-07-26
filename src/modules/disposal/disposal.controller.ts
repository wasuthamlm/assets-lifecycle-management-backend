import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DisposalService } from './disposal.service';
import { CreateDisposalDto } from './dto/create-disposal.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';

@ApiTags('disposal')
@ApiBearerAuth()
@Controller('disposals')
export class DisposalController {
  constructor(private service: DisposalService) {}

  @Post() @RequirePermissions('disposal.create')
  create(@Body() dto: CreateDisposalDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, requireEmployeeId(user));
  }

  @Get() @RequirePermissions('disposal.view')
  findAll() { return this.service.findAll(); }

  @Get(':id') @RequirePermissions('disposal.view')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
}
