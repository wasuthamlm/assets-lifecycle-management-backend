import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssignmentsService } from './assignments.service';
import { IssueAssetDto } from './dto/issue-asset.dto';
import { ReturnAssetDto } from './dto/return-asset.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private service: AssignmentsService) {}

  @Post('issue')
  @RequirePermissions('assignment.issue')
  issue(@Body() dto: IssueAssetDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.issue(dto, requireEmployeeId(user));
  }

  @Post(':id/return')
  @RequirePermissions('assignment.return')
  returnAsset(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnAssetDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.return_(id, dto, requireEmployeeId(user));
  }

  @Get('mine')
  @RequirePermissions('asset.view')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMine(requireEmployeeId(user));
  }

  @Get('asset/:assetId')
  @RequirePermissions('asset.view')
  findByAsset(@Param('assetId', ParseIntPipe) assetId: number) {
    return this.service.findByAsset(assetId);
  }

  @Get(':id')
  @RequirePermissions('asset.view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
