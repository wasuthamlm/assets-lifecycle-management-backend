import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PasswordChangeGuard } from './password-change.guard';

describe('PasswordChangeGuard', () => {
  let reflector: Reflector;
  let guard: PasswordChangeGuard;

  const buildContext = (user: { mustChangePassword: boolean } | undefined): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PasswordChangeGuard(reflector);
  });

  it('allows public routes through (no user on request)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('allows a user who does not need to change their password', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(buildContext({ mustChangePassword: false }))).toBe(true);
  });

  it('blocks a user with mustChangePassword=true from other endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(() => guard.canActivate(buildContext({ mustChangePassword: true }))).toThrow(ForbiddenException);
  });

  it('allows a user with mustChangePassword=true through an @AllowPendingPasswordChange() route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(guard.canActivate(buildContext({ mustChangePassword: true }))).toBe(true);
  });
});
