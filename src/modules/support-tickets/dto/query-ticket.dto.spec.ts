import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { TicketStatus } from '@common/enums';
import { QueryTicketDto } from './query-ticket.dto';

describe('QueryTicketDto status', () => {
  // ตั้งค่าให้เหมือน ValidationPipe ใน main.ts
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const parse = (query: Record<string, string>): Promise<QueryTicketDto> =>
    pipe.transform(query, { type: 'query', metatype: QueryTicketDto });

  it('รับสถานะเดียวได้เหมือนเดิม', async () => {
    expect((await parse({ status: 'open' })).status).toEqual([TicketStatus.OPEN]);
  });

  it('รับหลายสถานะคั่นด้วยคอมมา', async () => {
    expect((await parse({ status: 'resolved,closed' })).status).toEqual([TicketStatus.RESOLVED, TicketStatus.CLOSED]);
  });

  it('ปฏิเสธสถานะที่ไม่มีอยู่จริง', async () => {
    await expect(parse({ status: 'resolved,nope' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
