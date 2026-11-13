import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiExcludeController, ApiHeader, ApiTags } from '@nestjs/swagger';
import { TicketSource } from '@common/enums';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload, AuthService } from '../auth/auth.service';
import { SupportTicketsService } from '../support-tickets/support-tickets.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { CreateTicketDto } from '../support-tickets/dto/create-ticket.dto';
import { QueryTicketDto } from '../support-tickets/dto/query-ticket.dto';
import { ALLOWED_ATTACHMENT_MIME_TYPES, maxAttachmentSizeBytes } from '../attachments/attachment-upload.config';
import { LineAuthService } from './line-auth.service';
import { LineLinkService } from './line-link.service';
import { LineIdTokenGuard, LINE_ID_TOKEN_HEADER } from './line-id-token.guard';
import { LinkLineDto } from './dto/link-line.dto';
import { LineChatService, LineWebhookEvent } from './line-chat.service';

/** endpoint ฝั่งเว็บ (JWT ปกติ) — ผูก/ยกเลิกผูกบัญชี LINE ของตัวเอง */
@ApiTags('line')
@ApiBearerAuth()
@Controller('line')
export class LineLinkController {
  constructor(
    private lineAuth: LineAuthService,
    private linkService: LineLinkService,
  ) {}

  /** หน้า LIFF ต้องรู้ liffId ก่อน liff.init() — ยังไม่มีใคร login ณ จุดนั้น */
  @Public()
  @Get('config')
  config() {
    return {
      enabled: this.lineAuth.isEnabled,
      liffId: this.lineAuth.liffId,
      chatEnabled: this.lineAuth.isChatEnabled,
      addFriendUrl: this.lineAuth.addFriendUrl,
    };
  }

  /** รหัส 6 หลักสำหรับพิมพ์ในแชท OA เพื่อผูกบัญชี (แชทบอท) — อายุ 10 นาที ใช้ได้ครั้งเดียว */
  @Post('link-code')
  linkCode(@CurrentUser() user: CurrentUserPayload) {
    if (!this.lineAuth.isChatEnabled) throw new ServiceUnavailableException('ยังไม่ได้เปิดใช้งานแชท LINE');
    return this.linkService.createLinkCode(requireEmployeeId(user));
  }

  @Get('link')
  status(@CurrentUser() user: CurrentUserPayload) {
    return this.linkService.status(requireEmployeeId(user));
  }

  @Post('link')
  link(@Body() dto: LinkLineDto, @CurrentUser() user: CurrentUserPayload) {
    return this.linkService.link(requireEmployeeId(user), dto.idToken);
  }

  @Delete('link')
  unlink(@CurrentUser() user: CurrentUserPayload) {
    return this.linkService.unlink(requireEmployeeId(user));
  }
}

function assertPermission(user: CurrentUserPayload, code: string) {
  if (!user.permissions.includes(code)) throw new ForbiddenException('คุณไม่มีสิทธิ์ทำรายการนี้');
}

/**
 * endpoint สำหรับหน้า LIFF ใน LINE — ยืนยันตัวด้วย LINE ID token (header X-Line-Id-Token) แทน JWT
 * ticket ที่สร้างจากที่นี่ได้ source = 'line' เสมอ — เป็นทางเดียวที่ตั้งค่านี้ได้
 * สิทธิ์ตรงกับ endpoint เว็บ: สร้าง = ticket.create, ดูของตัวเอง = ticket.view_own, ของที่ถือ = asset.view
 */
@ApiTags('line')
@ApiHeader({ name: LINE_ID_TOKEN_HEADER, required: true, description: 'liff.getIDToken()' })
@Public()
@UseGuards(LineIdTokenGuard)
@Controller('line/liff')
export class LineLiffController {
  constructor(
    private authService: AuthService,
    private tickets: SupportTicketsService,
    private assignments: AssignmentsService,
  ) {}

  /** ข้อมูลผู้แจ้งไว้เติมฟอร์ม — shape เดียวกับ GET /auth/me */
  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.me(user);
  }

  @Get('my-assignments')
  myAssignments(@CurrentUser() user: CurrentUserPayload) {
    assertPermission(user, 'asset.view');
    return this.assignments.findMine(requireEmployeeId(user));
  }

  @Post('tickets')
  createTicket(@Body() dto: CreateTicketDto, @CurrentUser() user: CurrentUserPayload) {
    assertPermission(user, 'ticket.create');
    return this.tickets.create(
      dto,
      { employeeId: requireEmployeeId(user), permissions: user.permissions },
      { source: TicketSource.LINE },
    );
  }

  @Get('tickets/mine')
  myTickets(@Query() query: QueryTicketDto, @CurrentUser() user: CurrentUserPayload) {
    assertPermission(user, 'ticket.view_own');
    return this.tickets.findMine(requireEmployeeId(user), query);
  }

  @Get('tickets/:id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.tickets.findOne(id, user);
  }

  @Get('tickets/:id/attachments')
  listAttachments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.tickets.listAttachments(id, user);
  }

  @Post('tickets/:id/attachments')
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
    return this.tickets.uploadAttachment(id, file, user, requireEmployeeId(user));
  }
}

/** ลายเซ็น webhook = base64(HMAC-SHA256(channel secret, body ดิบ)) — https://developers.line.biz/en/docs/messaging-api/receiving-messages/#verify-signature */
export function isValidLineSignature(rawBody: Buffer, signature: string | undefined, channelSecret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * webhook ของแชทบอท — ตั้ง URL นี้ใน LINE Developers Console (Messaging API → Webhook URL)
 * ตอบ 200 ทันทีแล้วค่อยจัดการ event (LINE รอ webhook ไม่นาน และ retry ถ้าช้า/ไม่ใช่ 2xx)
 * ข้าม throttle เพราะทุก request มาจาก IP ของ LINE ชุดเดียวกัน — ป้องกันด้วยลายเซ็นแทน
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('line/webhook')
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private lineAuth: LineAuthService,
    private chat: LineChatService,
  ) {}

  @Post()
  @HttpCode(200)
  receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-line-signature') signature: string | undefined,
    @Body() body: { events?: LineWebhookEvent[] },
  ) {
    const secret = this.lineAuth.channelSecret;
    if (!secret || !this.lineAuth.isChatEnabled) throw new ServiceUnavailableException('ยังไม่ได้เปิดใช้งานแชท LINE');
    if (!req.rawBody || !isValidLineSignature(req.rawBody, signature, secret)) {
      throw new UnauthorizedException('ลายเซ็น LINE ไม่ถูกต้อง');
    }
    const events = body.events ?? [];
    // ปุ่ม Verify ใน console ส่ง events ว่างมา — ตอบ 200 เฉยๆ
    if (events.length) {
      void this.chat.handleEvents(events).catch((err) => this.logger.error(`LINE webhook: ${(err as Error).message}`));
    }
    return { ok: true };
  }
}
