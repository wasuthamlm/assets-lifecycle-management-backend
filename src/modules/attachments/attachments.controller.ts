import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private service: AttachmentsService) {}

  @Post() @RequirePermissions('attachment.manage')
  create(@Body() dto: CreateAttachmentDto) { return this.service.create(dto); }

  @Get() @RequirePermissions('attachment.view')
  findByReference(@Query('referenceType') referenceType: string, @Query('referenceId', ParseIntPipe) referenceId: number) {
    return this.service.findByReference(referenceType, referenceId);
  }

  @Delete(':id') @RequirePermissions('attachment.manage')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
