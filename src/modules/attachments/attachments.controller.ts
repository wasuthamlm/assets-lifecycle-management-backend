import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';
import { ALLOWED_ATTACHMENT_MIME_TYPES, maxAttachmentSizeBytes } from './attachment-upload.config';

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private service: AttachmentsService) {}

  @Post() @RequirePermissions('attachment.manage')
  create(@Body() dto: CreateAttachmentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, requireEmployeeId(user));
  }

  @Post('upload')
  @RequirePermissions('attachment.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: maxAttachmentSizeBytes() },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
          return cb(new BadRequestException('รองรับเฉพาะไฟล์ jpg, png, webp หรือ pdf'), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadAttachmentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    return this.service.saveUpload(file, dto, requireEmployeeId(user));
  }

  @Get() @RequirePermissions('attachment.view')
  findByReference(@Query('referenceType') referenceType: string, @Query('referenceId', ParseIntPipe) referenceId: number) {
    return this.service.findByReference(referenceType, referenceId);
  }

  @Delete(':id') @RequirePermissions('attachment.manage')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
