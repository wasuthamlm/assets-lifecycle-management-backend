import * as argon2 from 'argon2';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwtService = { signAsync: jest.fn().mockResolvedValue('token') } as any;
  const config = { get: jest.fn().mockReturnValue('secret') } as any;
  const jwtStrategy = { invalidate: jest.fn() } as any;
  const mailService = { send: jest.fn().mockResolvedValue(undefined) } as any;
  const employeesRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
  const allowedDomainsService = { isDomainAllowed: jest.fn().mockResolvedValue(true) } as any;
  const supabaseIdentity = { verifyAccessToken: jest.fn() } as any;

  describe('login', () => {
    it('returns mustChangePassword=true for a user still on a temporary password', async () => {
      const passwordHash = await argon2.hash('Admin@12345');
      const user = { userId: 1, username: 'admin', passwordHash, isActive: true, mustChangePassword: true };
      const usersRepo = { findOne: jest.fn().mockResolvedValue(user), save: jest.fn().mockResolvedValue(user) } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

      const result = await service.login({ username: 'admin', password: 'Admin@12345' });
      expect(result.mustChangePassword).toBe(true);
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await argon2.hash('Admin@12345');
      const user = { userId: 1, username: 'admin', passwordHash, isActive: true, mustChangePassword: true };
      const usersRepo = { findOne: jest.fn().mockResolvedValue(user) } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

      await expect(service.login({ username: 'admin', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('rejects when currentPassword is wrong', async () => {
      const passwordHash = await argon2.hash('Admin@12345');
      const user = { userId: 1, passwordHash, mustChangePassword: true };
      const usersRepo = { findOne: jest.fn().mockResolvedValue(user) } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

      await expect(
        service.changePassword(1, { currentPassword: 'wrong', newPassword: 'NewStrongP@ss1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('clears mustChangePassword, rehashes, and invalidates the JwtStrategy cache on success', async () => {
      const passwordHash = await argon2.hash('Admin@12345');
      const user = { userId: 1, passwordHash, mustChangePassword: true };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

      await service.changePassword(1, { currentPassword: 'Admin@12345', newPassword: 'NewStrongP@ss1' });

      expect(user.mustChangePassword).toBe(false);
      expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ mustChangePassword: false }));
      expect(jwtStrategy.invalidate).toHaveBeenCalledWith(1);
    });
  });

  describe('forgotPassword', () => {
    it('returns success without sending mail when the email is not registered', async () => {
      const usersRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

      const result = await service.forgotPassword({ email: 'nobody@example.com' });

      expect(result).toEqual({ success: true });
      expect(mailService.send).not.toHaveBeenCalled();
    });

    it('stores a hashed token and emails a reset link when the user exists', async () => {
      const user: any = { userId: 1, email: 'admin@example.com', isActive: true };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

      await service.forgotPassword({ email: 'admin@example.com' });

      expect(user.resetPasswordTokenHash).toBeTruthy();
      expect(user.resetPasswordExpiresAt).toBeInstanceOf(Date);
      expect(mailService.send).toHaveBeenCalledWith('admin@example.com', expect.any(String), expect.any(String));
    });
  });

  describe('loginWithSso', () => {
    const makeService = (usersRepo: any) =>
      new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

    it('rejects identities not verified as coming from the azure provider', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-1',
        email: 'attacker@millimedthailand.com',
        provider: 'email',
      });
      const usersRepo = { findOne: jest.fn() } as any;
      const service = makeService(usersRepo);

      await expect(service.loginWithSso({ accessToken: 'tok' })).rejects.toThrow(UnauthorizedException);
      expect(usersRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects a verified azure identity whose email domain is not allowlisted', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-2',
        email: 'someone@notallowed.com',
        provider: 'azure',
      });
      allowedDomainsService.isDomainAllowed.mockResolvedValueOnce(false);
      const usersRepo = { findOne: jest.fn() } as any;
      const service = makeService(usersRepo);

      await expect(service.loginWithSso({ accessToken: 'tok' })).rejects.toThrow(UnauthorizedException);
    });

    it('rejects SSO login when no employee record matches the email (fail closed, not silent 403s later)', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-5',
        email: 'nobody.tracked@millimedthailand.com',
        provider: 'azure',
      });
      employeesRepo.findOne.mockResolvedValueOnce(null);
      const usersRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null) // no user by supabaseUserId
          .mockResolvedValueOnce(null), // no existing local user by email/username
      } as any;
      const service = makeService(usersRepo);

      await expect(service.loginWithSso({ accessToken: 'tok' })).rejects.toThrow(UnauthorizedException);
    });

    it('provisions a new local user linked to the matching employee on first azure SSO login', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-3',
        email: 'new.person@millimedthailand.com',
        provider: 'azure',
      });
      employeesRepo.findOne.mockResolvedValueOnce({ employeeId: 42 });
      const created = { userId: 5, isActive: true, mustChangePassword: false };
      const usersRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null) // no user by supabaseUserId
          .mockResolvedValueOnce(null), // no existing local user by email/username
        create: jest.fn().mockReturnValue(created),
        save: jest.fn().mockResolvedValue(created),
      } as any;
      const service = makeService(usersRepo);

      const result = await service.loginWithSso({ accessToken: 'tok' });

      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'new.person@millimedthailand.com',
          email: 'new.person@millimedthailand.com',
          employeeId: 42,
        }),
      );
      expect(result.accessToken).toBe('token');
    });

    it('recovers when a concurrent request already provisioned the same supabase user (race)', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-4',
        email: 'racey@millimedthailand.com',
        provider: 'azure',
      });
      employeesRepo.findOne.mockResolvedValueOnce({ employeeId: 7 });
      const raceWinner = { userId: 9, isActive: true, mustChangePassword: false };
      const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
      const usersRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null) // no user by supabaseUserId (pre-check)
          .mockResolvedValueOnce(null) // no existing local user by email/username
          .mockResolvedValueOnce(raceWinner), // re-fetch after unique violation
        create: jest.fn().mockReturnValue({}),
        // ครั้งแรก (provisioning) ชน unique violation จาก request คู่ขนาน — ครั้งถัดไป (issueTokens บันทึก
        // refreshTokenHash ของ raceWinner) ต้องผ่านตามปกติ
        save: jest.fn().mockRejectedValueOnce(uniqueViolation).mockResolvedValue(raceWinner),
      } as any;
      const service = makeService(usersRepo);

      const result = await service.loginWithSso({ accessToken: 'tok' });

      expect(result.accessToken).toBe('token');
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown or expired token', async () => {
      const usersRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

      await expect(service.resetPassword({ token: 'bad', newPassword: 'NewStrongP@ss1' })).rejects.toThrow(
        'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ',
      );
    });

    it('sets a new password hash and clears the reset token/refresh session on success', async () => {
      const user = {
        userId: 1,
        passwordHash: 'old-hash',
        mustChangePassword: true,
        resetPasswordTokenHash: 'irrelevant-because-repo-is-mocked',
        resetPasswordExpiresAt: new Date(Date.now() + 60_000),
        refreshTokenHash: 'some-hash',
      };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
      );

      await service.resetPassword({ token: 'valid-raw-token', newPassword: 'NewStrongP@ss1' });

      expect(user.passwordHash).not.toBe('old-hash');
      expect(user.mustChangePassword).toBe(false);
      expect(user.resetPasswordTokenHash).toBeNull();
      expect(user.resetPasswordExpiresAt).toBeNull();
      expect(user.refreshTokenHash).toBeNull();
      expect(jwtStrategy.invalidate).toHaveBeenCalledWith(1);
    });
  });
});
