import * as argon2 from 'argon2';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwtService = { signAsync: jest.fn().mockResolvedValue('token') } as any;
  const config = { get: jest.fn().mockReturnValue('secret') } as any;
  const jwtStrategy = { invalidate: jest.fn() } as any;
  const mailService = { send: jest.fn().mockResolvedValue(undefined) } as any;

  describe('login', () => {
    it('returns mustChangePassword=true for a user still on a temporary password', async () => {
      const passwordHash = await argon2.hash('Admin@12345');
      const user = { userId: 1, username: 'admin', passwordHash, isActive: true, mustChangePassword: true };
      const usersRepo = { findOne: jest.fn().mockResolvedValue(user), save: jest.fn().mockResolvedValue(user) } as any;
      const service = new AuthService(usersRepo, jwtService, config, jwtStrategy, mailService);

      const result = await service.login({ username: 'admin', password: 'Admin@12345' });
      expect(result.mustChangePassword).toBe(true);
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await argon2.hash('Admin@12345');
      const user = { userId: 1, username: 'admin', passwordHash, isActive: true, mustChangePassword: true };
      const usersRepo = { findOne: jest.fn().mockResolvedValue(user) } as any;
      const service = new AuthService(usersRepo, jwtService, config, jwtStrategy, mailService);

      await expect(service.login({ username: 'admin', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('rejects when currentPassword is wrong', async () => {
      const passwordHash = await argon2.hash('Admin@12345');
      const user = { userId: 1, passwordHash, mustChangePassword: true };
      const usersRepo = { findOne: jest.fn().mockResolvedValue(user) } as any;
      const service = new AuthService(usersRepo, jwtService, config, jwtStrategy, mailService);

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
      const service = new AuthService(usersRepo, jwtService, config, jwtStrategy, mailService);

      await service.changePassword(1, { currentPassword: 'Admin@12345', newPassword: 'NewStrongP@ss1' });

      expect(user.mustChangePassword).toBe(false);
      expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ mustChangePassword: false }));
      expect(jwtStrategy.invalidate).toHaveBeenCalledWith(1);
    });
  });

  describe('forgotPassword', () => {
    it('returns success without sending mail when the email is not registered', async () => {
      const usersRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
      const service = new AuthService(usersRepo, jwtService, config, jwtStrategy, mailService);

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
      const service = new AuthService(usersRepo, jwtService, config, jwtStrategy, mailService);

      await service.forgotPassword({ email: 'admin@example.com' });

      expect(user.resetPasswordTokenHash).toBeTruthy();
      expect(user.resetPasswordExpiresAt).toBeInstanceOf(Date);
      expect(mailService.send).toHaveBeenCalledWith('admin@example.com', expect.any(String), expect.any(String));
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown or expired token', async () => {
      const usersRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
      const service = new AuthService(usersRepo, jwtService, config, jwtStrategy, mailService);

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
      const service = new AuthService(usersRepo, jwtService, config, jwtStrategy, mailService);

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
