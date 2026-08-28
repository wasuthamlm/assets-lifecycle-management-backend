import { Controller, Get, Param, ParseIntPipe, Post, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { requireEmployeeId } from '@common/utils/require-employee-id.util';
import { CurrentUserPayload } from '../auth/auth.service';

// ไม่มี @RequirePermissions ที่ endpoint กลุ่มนี้เลย — เหมือน /my-items คือ "ของตัวเอง" ล้วนๆ
// ไม่มีแนวคิด view_all เพราะ scope ผูกกับ CurrentUser().employeeId เสมอ ไม่รับ id จาก client
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  findMine(@CurrentUser() user: CurrentUserPayload, @Query('unreadOnly') unreadOnly?: string) {
    return this.service.findMine(requireEmployeeId(user), unreadOnly === 'true');
  }

  // ต้องใช้ client ที่ตั้ง header Authorization ได้ (เช่น fetch-based SSE) เพราะ EventSource ของเบราว์เซอร์เองส่ง header เองไม่ได้
  @Sse('stream')
  stream(@CurrentUser() user: CurrentUserPayload) {
    return this.service.streamFor(requireEmployeeId(user));
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: CurrentUserPayload) {
    const count = await this.service.unreadCount(requireEmployeeId(user));
    return { count };
  }

  @Post(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markRead(id, requireEmployeeId(user));
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.service.markAllRead(requireEmployeeId(user));
  }

  // "ลบ" ในมุมมองผู้ใช้ — ซ่อนออกจากรายการเฉยๆ ไม่ได้ลบแถวจริง (ดู NotificationsService.dismiss)
  @Post(':id/dismiss')
  dismiss(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload) {
    return this.service.dismiss(id, requireEmployeeId(user));
  }

  @Post('dismiss-all')
  dismissAll(@CurrentUser() user: CurrentUserPayload) {
    return this.service.dismissAll(requireEmployeeId(user));
  }
}
