import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssignmentsService } from './assignments.service';
import { IssueAssetDto } from './dto/issue-asset.dto';
import { ReturnAssetDto } from './dto/return-asset.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private service: AssignmentsService) {}

  @Post('issue')
  @RequirePermissions('assignment.issue')
  issue(@Body() dto: IssueAssetDto) {
    return this.service.issue(dto);
  }

  @Post(':id/return')
  @RequirePermissions('assignment.return')
  returnAsset(@Param('id', ParseIntPipe) id: number, @Body() dto: ReturnAssetDto) {
    return this.service.return_(id, dto);
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
