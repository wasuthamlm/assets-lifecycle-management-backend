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
import { RequisitionsService } from './requisitions.service';
import { CreateRequisitionDto } from './dto/create-requisition.dto';
import { ApproveRequisitionDto } from './dto/approve-requisition.dto';
import { NextRequisitionNoQueryDto } from './dto/next-requisition-no.dto';
import { QueryRequisitionDto } from './dto/query-requisition.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';
import { ALLOWED_ATTACHMENT_MIME_TYPES, maxAttachmentSizeBytes } from '../attachments/attachment-upload.config';

@ApiTags('requisitions')
@ApiBearerAuth()
@Controller('requisitions')
export class RequisitionsController {
  constructor(private service: RequisitionsService) {}

  @Post() @RequirePermissions('requisition.create')
  create(@Body() dto: CreateRequisitionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, requireEmployeeId(user));
  }

  @Get() @RequirePermissions('requisition.view_all')
  findAll(@Query() query: QueryRequisitionDto) { return this.service.findAll(query); }

  // preview เลขที่เอกสารถัดไปให้หน้าสร้างใบขอใช้แสดง — ใช้สิทธิ์เดียวกับการสร้าง ไม่ใช่ view_all
  // ต้องระบุ requestType เพราะเบิก/ยืม รันเลข sequence แยกกันคนละ prefix
  @Get('next-no') @RequirePermissions('requisition.create')
  nextNo(@Query() query: NextRequisitionNoQueryDto) {
    return this.service.peekNextRequisitionNo(query.requestType).then((requisitionNo) => ({ requisitionNo }));
  }

  @Get('mine') @RequirePermissions('requisition.view_own')
  findMine(@Query() query: QueryRequisitionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findMine(requireEmployeeId(user), query);
  }

  @Get(':id') @RequirePermissions('requisition.view_own')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  // ไม่มี @RequirePermissions ที่ 3 endpoint นี้เลย เหมือน /notifications — scope ผูกกับ
  // ความเป็นเจ้าของใบขอ (หรือ requisition.view_all) ที่เช็คอยู่แล้วใน findOne() ภายใน service
  // ไม่ใช้ attachment.view/attachment.manage เพราะเป็น permission ระดับ global ไม่ผูก ownership
  @Get(':id/attachments')
  listAttachments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listAttachments(id, user);
  }

  @Post(':id/attachments')
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
  uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    return this.service.uploadAttachment(id, file, user, requireEmployeeId(user));
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeAttachment(id, attachmentId, user);
  }

  @Post(':id/approve') @RequirePermissions('requisition.approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveRequisitionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.approve(id, dto, requireEmployeeId(user));
  }
}
