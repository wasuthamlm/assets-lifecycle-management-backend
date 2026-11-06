import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SupportTicketsService } from './support-tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { EscalateToRepairDto } from './dto/escalate-to-repair.dto';
import { RequirePermissions } from '@common/decorators/permissions.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';
import { ALLOWED_ATTACHMENT_MIME_TYPES, maxAttachmentSizeBytes } from '../attachments/attachment-upload.config';

/**
 * สิทธิ์: employee แจ้ง + ดูของตัวเอง (view_own) / hr ดูทั้งหมดแบบอ่านอย่างเดียว (view_all) /
 * it_admin จัดการได้ทุกอย่าง (manage) — endpoint ที่แก้ข้อมูล ticket ใช้ ticket.manage ทั้งหมด จึงไม่มีทางที่ hr จะแก้ได้
 * ไม่มี endpoint ลบ ticket — เก็บไว้เป็นประวัติ ยกเลิกได้ผ่านสถานะ cancelled เท่านั้น
 */
@ApiTags('support-tickets')
@ApiBearerAuth()
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private service: SupportTicketsService) {}

  @Post() @RequirePermissions('ticket.create')
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, { employeeId: requireEmployeeId(user), permissions: user.permissions });
  }

  @Get() @RequirePermissions('ticket.view_all')
  findAll(@Query() query: QueryTicketDto) { return this.service.findAll(query); }

  // ต้องประกาศก่อน @Get(':id') ไม่งั้น 'mine' จะถูกจับเป็น :id แล้วโดน ParseIntPipe ปฏิเสธ
  @Get('mine') @RequirePermissions('ticket.view_own')
  findMine(@Query() query: QueryTicketDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findMine(requireEmployeeId(user), query);
  }

  // ไม่มี @RequirePermissions — scope ผูกกับความเป็นเจ้าของ ticket (หรือ ticket.view_all) ใน findOne() ของ service
  // เหมือน requisitions/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Patch(':id/status') @RequirePermissions('ticket.manage')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateStatus(id, dto, requireEmployeeId(user));
  }

  @Post(':id/escalate-repair') @RequirePermissions('ticket.manage')
  escalateToRepair(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EscalateToRepairDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.escalateToRepair(id, dto, requireEmployeeId(user));
  }

  // ไฟล์แนบ (รูปอาการเสีย) — ไม่ใช้ attachment.view/attachment.manage เพราะเป็น permission ระดับ global ไม่ผูก
  // ownership เหมือน requisitions/:id/attachments: ดูได้ = เจ้าของหรือ view_all, แนบ/ลบได้ = เจ้าของหรือ ticket.manage
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
}
