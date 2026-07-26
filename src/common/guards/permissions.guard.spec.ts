import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  const buildContext = (userPermissions: string[] | undefined): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: userPermissions ? { permissions: userPermissions } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('allows access when no permissions are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(buildContext([]))).toBe(true);
  });

  it('allows access when user has all required permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['asset.create']);
    expect(guard.canActivate(buildContext(['asset.create', 'asset.read']))).toBe(true);
  });

  it('throws ForbiddenException when user is missing a required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['asset.create']);
    expect(() => guard.canActivate(buildContext(['asset.read']))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has no permissions at all', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['asset.create']);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });
});
