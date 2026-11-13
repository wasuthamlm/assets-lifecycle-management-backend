import { createHmac } from 'crypto';
import { TicketCategory, TicketSource } from '@common/enums';
import { LineChatService, LineWebhookEvent } from './line-chat.service';
import { LineLinkService, LINK_CODE_TTL_MS } from './line-link.service';
import { isValidLineSignature } from './line.controller';

describe('isValidLineSignature', () => {
  const body = Buffer.from('{"events":[]}');
  const sign = (secret: string) => createHmac('sha256', secret).update(body).digest('base64');

  it('accepts a signature made with the channel secret', () => {
    expect(isValidLineSignature(body, sign('s3cret'), 's3cret')).toBe(true);
  });

  it('rejects a wrong or missing signature', () => {
    expect(isValidLineSignature(body, sign('other'), 's3cret')).toBe(false);
    expect(isValidLineSignature(body, undefined, 's3cret')).toBe(false);
    expect(isValidLineSignature(body, 'short', 's3cret')).toBe(false);
  });
});

describe('LineLinkService link codes', () => {
  const build = () => {
    const employees = { update: jest.fn(), findOne: jest.fn() } as any;
    return { service: new LineLinkService({} as any, employees), employees };
  };

  it('links with a valid code exactly once', async () => {
    const { service, employees } = build();
    const { code } = service.createLinkCode(7);
    expect(code).toMatch(/^\d{6}$/);
    await expect(service.linkByCode('U1', code)).resolves.toBe('linked');
    expect(employees.update).toHaveBeenLastCalledWith({ employeeId: 7 }, { lineUserId: 'U1' });
    await expect(service.linkByCode('U1', code)).resolves.toBe('invalid');
  });

  it('rejects expired codes', async () => {
    const { service } = build();
    const { code } = service.createLinkCode(7, 0);
    await expect(service.linkByCode('U1', code, LINK_CODE_TTL_MS + 1)).resolves.toBe('invalid');
  });

  it('a new code replaces the previous one for the same employee', async () => {
    const { service } = build();
    const first = service.createLinkCode(7).code;
    service.createLinkCode(7);
    await expect(service.linkByCode('U1', first)).resolves.toBe('invalid');
  });

  it('locks out after 5 wrong guesses even if the 6th is right', async () => {
    const { service } = build();
    const { code } = service.createLinkCode(7);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await service.linkByCode('U1', wrong);
    await expect(service.linkByCode('U1', code)).resolves.toBe('too_many_attempts');
  });
});

describe('LineChatService', () => {
  const linkedUser = { userId: 3, username: 'somchai', employeeId: 7, permissions: ['ticket.create'], roles: [], mustChangePassword: false };

  const build = (opts: { linked?: boolean; recentTicket?: any } = {}) => {
    const messaging = {
      reply: jest.fn(),
      getMessageContent: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), contentType: 'image/jpeg' }),
    } as any;
    const linkService = { linkByCode: jest.fn().mockResolvedValue('invalid') } as any;
    const tickets = {
      create: jest.fn().mockImplementation(async (dto) => ({ ticketId: 42, ticketNo: 'IT-6911-0001', subject: dto.subject })),
      uploadAttachment: jest.fn(),
      findMine: jest.fn().mockResolvedValue({ data: [] }),
    } as any;
    const jwt = { validate: jest.fn().mockResolvedValue(linkedUser) } as any;
    const users = {
      findOne: jest.fn().mockResolvedValue(opts.linked === false ? null : { userId: 3, username: 'somchai', employee: { employeeId: 7, fullName: 'สมชาย ใจดี' } }),
    } as any;
    const ticketRepo = { findOne: jest.fn().mockResolvedValue(opts.recentTicket ?? null) } as any;
    const service = new LineChatService(messaging, linkService, tickets, jwt, users, ticketRepo);
    return { service, messaging, linkService, tickets };
  };

  const text = (t: string): LineWebhookEvent => ({
    type: 'message',
    replyToken: 'rt',
    source: { type: 'user', userId: 'U1' },
    message: { id: 'm1', type: 'text', text: t },
  });
  const replied = (messaging: any) => messaging.reply.mock.calls.at(-1)[1].join('\n');

  it('creates a LINE ticket from one message and replies with the ticket number (no push)', async () => {
    const { service, tickets, messaging } = build();
    await service.handleEvents([text('โน้ตบุ๊กเปิดไม่ติด\nอยู่ชั้น 3 ห้องบัญชี')]);
    expect(tickets.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: TicketCategory.OTHER, subject: 'โน้ตบุ๊กเปิดไม่ติด', description: 'โน้ตบุ๊กเปิดไม่ติด\nอยู่ชั้น 3 ห้องบัญชี' }),
      { employeeId: 7, permissions: ['ticket.create'] },
      { source: TicketSource.LINE, notifyReporter: false },
    );
    expect(replied(messaging)).toContain('IT-6911-0001');
  });

  it('does not open tickets for greetings or commands', async () => {
    const { service, tickets } = build();
    await service.handleEvents([text('สวัสดีครับ'), text('ok'), text('สถานะ'), text('ช่วยเหลือ')]);
    expect(tickets.create).not.toHaveBeenCalled();
  });

  it('asks unlinked users for a code and links with a 6-digit message', async () => {
    const { service, tickets, linkService, messaging } = build({ linked: false });
    await service.handleEvents([text('คอมพัง')]);
    expect(tickets.create).not.toHaveBeenCalled();
    expect(replied(messaging)).toContain('รหัส 6 หลัก');

    linkService.linkByCode.mockResolvedValue('linked');
    await service.handleEvents([text('123456')]);
    expect(linkService.linkByCode).toHaveBeenCalledWith('U1', '123456');
  });

  it('attaches an image to the latest chat ticket', async () => {
    const { service, tickets, messaging } = build({ recentTicket: { ticketId: 42, ticketNo: 'IT-6911-0001' } });
    await service.handleEvents([{ ...text(''), message: { id: 'img1', type: 'image' } }]);
    expect(tickets.uploadAttachment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ mimetype: 'image/jpeg', originalname: 'line-img1.jpg' }),
      expect.anything(),
      7,
    );
    expect(replied(messaging)).toContain('IT-6911-0001');
  });

  it('asks for a description first when an image arrives with no recent ticket', async () => {
    const { service, tickets, messaging } = build();
    await service.handleEvents([{ ...text(''), message: { id: 'img1', type: 'image' } }]);
    expect(tickets.uploadAttachment).not.toHaveBeenCalled();
    expect(replied(messaging)).toContain('พิมพ์อาการ');
  });

  it('never throws — replies with an error message instead', async () => {
    const { service, tickets, messaging } = build();
    tickets.create.mockRejectedValue(new Error('db down'));
    await expect(service.handleEvents([text('จอดับ เปิดไม่ขึ้น')])).resolves.toBeUndefined();
    expect(replied(messaging)).toContain('ขัดข้อง');
  });
});
