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

/**
 * จำลองตาราง line_link_codes / line_link_attempts ในหน่วยความจำ — เฉพาะ method ที่ LineLinkService ใช้
 * (สองตารางนี้ต้องอยู่ใน DB เพราะเว็บกับ webhook อาจเป็นคนละ process ดู line-link-code.entity.ts)
 */
function fakeLinkRepos() {
  const codes = new Map<string, { code: string; employeeId: number; expiresAt: Date }>();
  const attempts = new Map<string, { lineUserId: string; failedCount: number; resetAt: Date }>();
  const codeRepo = {
    rows: codes,
    delete: jest.fn(async (where: any) => {
      for (const [k, v] of codes) {
        if (where.employeeId !== undefined && v.employeeId === where.employeeId) codes.delete(k);
        // LessThanOrEqual(date) → FindOperator ที่มี _value
        if (where.expiresAt && v.expiresAt.getTime() <= where.expiresAt._value.getTime()) codes.delete(k);
      }
    }),
    insert: jest.fn(async (row: any) => {
      if (codes.has(row.code)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      codes.set(row.code, { ...row });
    }),
    createQueryBuilder: jest.fn(() => {
      let params: any;
      const qb: any = {
        delete: () => qb,
        where: (_sql: string, p: any) => ((params = p), qb),
        returning: () => qb,
        execute: async () => {
          const row = codes.get(params.code);
          if (!row || row.expiresAt.getTime() <= params.now.getTime()) return { raw: [] };
          codes.delete(params.code);
          return { raw: [{ employee_id: row.employeeId }] };
        },
      };
      return qb;
    }),
  };
  const attemptRepo = {
    findOne: jest.fn(async ({ where }: any) => attempts.get(where.lineUserId) ?? null),
    save: jest.fn(async (row: any) => attempts.set(row.lineUserId, { ...row })),
    delete: jest.fn(async (where: any) => attempts.delete(where.lineUserId)),
  };
  return { codeRepo, attemptRepo };
}

describe('LineLinkService link codes', () => {
  const build = () => {
    const employees = { update: jest.fn(), findOne: jest.fn() } as any;
    const { codeRepo, attemptRepo } = fakeLinkRepos();
    return { service: new LineLinkService({} as any, employees, codeRepo as any, attemptRepo as any), employees, codeRepo };
  };

  it('links with a valid code exactly once', async () => {
    const { service, employees } = build();
    const { code } = await service.createLinkCode(7);
    expect(code).toMatch(/^\d{6}$/);
    await expect(service.linkByCode('U1', code)).resolves.toBe('linked');
    expect(employees.update).toHaveBeenLastCalledWith({ employeeId: 7 }, { lineUserId: 'U1' });
    await expect(service.linkByCode('U1', code)).resolves.toBe('invalid');
  });

  it('a code created by one instance is accepted by another (shared DB, not memory)', async () => {
    const employees = { update: jest.fn(), findOne: jest.fn() } as any;
    const { codeRepo, attemptRepo } = fakeLinkRepos();
    const web = new LineLinkService({} as any, employees, codeRepo as any, attemptRepo as any);
    const webhook = new LineLinkService({} as any, employees, codeRepo as any, attemptRepo as any);
    const { code } = await web.createLinkCode(7);
    await expect(webhook.linkByCode('U1', code)).resolves.toBe('linked');
  });

  it('rejects expired codes', async () => {
    const { service } = build();
    const { code } = await service.createLinkCode(7, 0);
    await expect(service.linkByCode('U1', code, LINK_CODE_TTL_MS + 1)).resolves.toBe('invalid');
  });

  it('a new code replaces the previous one for the same employee', async () => {
    const { service } = build();
    const first = (await service.createLinkCode(7)).code;
    await service.createLinkCode(7);
    await expect(service.linkByCode('U1', first)).resolves.toBe('invalid');
  });

  it('retries when the random code collides with someone else’s', async () => {
    const { service, codeRepo } = build();
    codeRepo.insert.mockImplementationOnce(async () => {
      throw Object.assign(new Error('duplicate'), { code: '23505' });
    });
    await expect(service.createLinkCode(7)).resolves.toEqual(expect.objectContaining({ code: expect.any(String) }));
    expect(codeRepo.insert).toHaveBeenCalledTimes(2);
  });

  it('locks out after 5 wrong guesses even if the 6th is right', async () => {
    const { service } = build();
    const { code } = await service.createLinkCode(7);
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
      replyMessages: jest.fn(),
      markAsRead: jest.fn(),
      showLoading: jest.fn(),
      webUrl: 'https://it.example.com',
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
    const ticketRepo = { findOne: jest.fn().mockResolvedValue(opts.recentTicket ?? null), update: jest.fn().mockResolvedValue({ affected: 1 }) } as any;
    const borrow = { handle: jest.fn().mockResolvedValue([{ type: 'text', text: 'borrow' }]) } as any;
    const requisitions = { findMine: jest.fn().mockResolvedValue({ data: [] }) } as any;
    const assignments = { findMine: jest.fn().mockResolvedValue([]) } as any;
    const staff = { handle: jest.fn().mockResolvedValue([{ type: 'text', text: 'staff' }]) } as any;
    const service = new LineChatService(messaging, linkService, tickets, jwt, users, ticketRepo, borrow, requisitions, assignments, staff);
    return { service, messaging, linkService, tickets, ticketRepo, borrow, staff };
  };

  const text = (t: string): LineWebhookEvent => ({
    type: 'message',
    replyToken: 'rt',
    source: { type: 'user', userId: 'U1' },
    message: { id: 'm1', type: 'text', text: t },
  });
  // คำตอบล่าสุด (reply ข้อความล้วน หรือ replyMessages แบบ Flex) เป็น JSON string ไว้เช็คด้วย toContain
  const replied = (messaging: any) => {
    const calls = [messaging.reply, messaging.replyMessages].flatMap((fn) =>
      fn.mock.calls.map((args: any[], i: number) => ({ order: fn.mock.invocationCallOrder[i], payload: args[1] })),
    );
    return JSON.stringify(calls.sort((a, b) => a.order - b.order).at(-1)?.payload);
  };
  const postback = (data: string, params?: { date: string }): LineWebhookEvent => ({
    type: 'postback',
    replyToken: 'rt',
    source: { type: 'user', userId: 'U1' },
    postback: { data, params },
  });

  it('marks incoming messages as read', async () => {
    const { service, messaging } = build();
    await service.handleEvents([{ ...text('สวัสดี'), message: { id: 'm1', type: 'text', text: 'สวัสดี', markAsReadToken: 'tok' } }]);
    expect(messaging.markAsRead).toHaveBeenCalledWith('tok');
  });

  it('rich menu postbacks: ticket prompt, borrow delegates, unlinked users get the link card', async () => {
    const { service, messaging, borrow } = build();
    await service.handleEvents([postback('a=menu&m=ticket')]);
    expect(replied(messaging)).toContain('พิมพ์อาการ');

    await service.handleEvents([postback('a=bt&as=5&t=b', { date: '2099-01-01' })]);
    const params: URLSearchParams = borrow.handle.mock.calls[0][1];
    expect(params.get('date')).toBe('2099-01-01');

    const unlinked = build({ linked: false });
    await unlinked.service.handleEvents([postback('a=menu&m=borrow')]);
    expect(unlinked.borrow.handle).not.toHaveBeenCalled();
    expect(replied(unlinked.messaging)).toContain('เชื่อมบัญชี');
  });

  it('category quick reply only updates the reporter’s own open LINE ticket', async () => {
    const { service, ticketRepo, messaging } = build();
    await service.handleEvents([postback('a=tc&id=42&c=network')]);
    expect(ticketRepo.update).toHaveBeenCalledWith(
      { ticketId: 42, reportedBy: 7, source: TicketSource.LINE, status: 'open' },
      { category: TicketCategory.NETWORK },
    );
    ticketRepo.update.mockClear();
    await service.handleEvents([postback('a=tc&id=42&c=bogus')]);
    expect(ticketRepo.update).not.toHaveBeenCalled();
    expect(replied(messaging)).toContain('ไม่ถูกต้อง');
  });

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
