import { ConflictException, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { LineLinkService } from './line-link.service';
import { LineIdTokenGuard, LINE_NOT_LINKED } from './line-id-token.guard';
import { LineMessagingService } from './line-messaging.service';
import { LineAuthService } from './line-auth.service';

const config = (values: Record<string, string | undefined>) => ({ get: (k: string) => values[k] }) as any;

describe('LineAuthService#verifyIdToken', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the LINE userId (sub) for a valid token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ sub: 'U123' }), { status: 200 }));
    const svc = new LineAuthService(config({ LINE_LOGIN_CHANNEL_ID: '2000' }));
    await expect(svc.verifyIdToken('tok')).resolves.toBe('U123');
    const body = fetchMock.mock.calls[0][1]!.body as URLSearchParams;
    expect(body.get('client_id')).toBe('2000');
  });

  it('rejects an invalid/expired token with 401', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"error":"invalid_request"}', { status: 400 }));
    const svc = new LineAuthService(config({ LINE_LOGIN_CHANNEL_ID: '2000' }));
    await expect(svc.verifyIdToken('bad')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('LineLinkService', () => {
  const build = (taken: any) => {
    const employees = { findOne: jest.fn().mockResolvedValue(taken), update: jest.fn() } as any;
    const lineAuth = { verifyIdToken: jest.fn().mockResolvedValue('U123') } as any;
    return { service: new LineLinkService(lineAuth, employees, {} as any, {} as any), employees };
  };

  it('links the LINE account to the caller', async () => {
    const { service, employees } = build(null);
    await expect(service.link(7, 'tok')).resolves.toEqual({ linked: true });
    expect(employees.update).toHaveBeenCalledWith({ employeeId: 7 }, { lineUserId: 'U123' });
  });

  it('409 when the LINE account is already linked to another employee', async () => {
    const { service, employees } = build({ employeeId: 9 });
    await expect(service.link(7, 'tok')).rejects.toBeInstanceOf(ConflictException);
    expect(employees.update).not.toHaveBeenCalled();
  });
});

describe('LineIdTokenGuard', () => {
  const ctx = (headers: Record<string, string>) => {
    const req: any = { headers };
    return { req, context: { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext };
  };
  const payload = { userId: 3, username: 'somchai', employeeId: 7, permissions: ['ticket.create'], roles: [], mustChangePassword: false };

  const build = (user: any, validated = payload) => {
    const lineAuth = { verifyIdToken: jest.fn().mockResolvedValue('U123') } as any;
    const jwt = { validate: jest.fn().mockResolvedValue(validated) } as any;
    const users = { findOne: jest.fn().mockResolvedValue(user) } as any;
    return new LineIdTokenGuard(lineAuth, jwt, users);
  };

  it('401 without the header', async () => {
    const { context } = ctx({});
    await expect(build(null).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it(`403 ${LINE_NOT_LINKED} when no employee is linked to this LINE account`, async () => {
    const { context } = ctx({ 'x-line-id-token': 'tok' });
    await expect(build(null).canActivate(context)).rejects.toThrow(LINE_NOT_LINKED);
  });

  it('sets req.user with the same permissions as a web login', async () => {
    const { req, context } = ctx({ 'x-line-id-token': 'tok' });
    await expect(build({ userId: 3, username: 'somchai' }).canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual(payload);
    expect(req.lineUserId).toBe('U123');
  });

  it('blocks users who still must change their password', async () => {
    const { context } = ctx({ 'x-line-id-token': 'tok' });
    const guard = build({ userId: 3, username: 'somchai' }, { ...payload, mustChangePassword: true });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('LineMessagingService#pushToEmployee', () => {
  afterEach(() => jest.restoreAllMocks());
  const employees = (lineUserId: string | null) => ({ findOne: jest.fn().mockResolvedValue({ employeeId: 7, lineUserId }) }) as any;

  it('does nothing without an access token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await new LineMessagingService(config({}), employees('U1')).pushToEmployee(7, 'hi');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when the employee has not linked LINE', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await new LineMessagingService(config({ LINE_MESSAGING_ACCESS_TOKEN: 't' }), employees(null)).pushToEmployee(7, 'hi');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pushes to the linked LINE user', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await new LineMessagingService(config({ LINE_MESSAGING_ACCESS_TOKEN: 't' }), employees('U1')).pushToEmployee(7, 'hi');
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ to: 'U1', messages: [{ type: 'text', text: 'hi' }] });
  });

  it('never throws when LINE is down', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(new LineMessagingService(config({ LINE_MESSAGING_ACCESS_TOKEN: 't' }), employees('U1')).pushToEmployee(7, 'hi')).resolves.toBeUndefined();
  });
});
