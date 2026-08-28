import * as argon2 from 'argon2';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwtService = { signAsync: jest.fn().mockResolvedValue('token') } as any;
  const config = { get: jest.fn().mockReturnValue('secret') } as any;
  const jwtStrategy = { invalidate: jest.fn() } as any;
  const mailService = { send: jest.fn().mockResolvedValue(undefined) } as any;
  const employeesRepo = { findOne: jest.fn().mockResolvedValue(null) } as any;
  const allowedDomainsService = { isDomainAllowed: jest.fn().mockResolvedValue(true) } as any;
  const supabaseIdentity = { verifyAccessToken: jest.fn() } as any;
  const notificationsService = { notify: jest.fn().mockResolvedValue(null) } as any;
  const departmentsRepo = {} as any;

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
        notificationsService,
        departmentsRepo,
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
        notificationsService,
        departmentsRepo,
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
        notificationsService,
        departmentsRepo,
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
        notificationsService,
        departmentsRepo,
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
        notificationsService,
        departmentsRepo,
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
        notificationsService,
        departmentsRepo,
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
        notificationsService,
        departmentsRepo,
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

    it('still provisions and logs in a user with no matching employee record (no permissions until admin links one later)', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-5',
        email: 'nobody.tracked@millimedthailand.com',
        provider: 'azure',
      });
      employeesRepo.findOne.mockResolvedValueOnce(null);
      const created = { userId: 6, isActive: true, mustChangePassword: false };
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
        expect.objectContaining({ email: 'nobody.tracked@millimedthailand.com', employeeId: undefined }),
      );
      expect(result.accessToken).toBe('token');
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

    it('stores the given_name/family_name from Azure AD as fullName on first provisioning', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-6',
        email: 'named.person@millimedthailand.com',
        provider: 'azure',
        fullName: 'สมชาย ใจดี',
      });
      employeesRepo.findOne.mockResolvedValueOnce(null);
      const created = { userId: 10, isActive: true, mustChangePassword: false };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        create: jest.fn().mockReturnValue(created),
        save: jest.fn().mockResolvedValue(created),
      } as any;
      const service = makeService(usersRepo);

      await service.loginWithSso({ accessToken: 'tok' });

      expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'สมชาย ใจดี' }));
    });

    it('re-syncs fullName on an already-provisioned user when Azure AD reports a new value', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-7',
        email: 'existing.person@millimedthailand.com',
        provider: 'azure',
        fullName: 'สมหญิง ใจงาม',
      });
      const existingUser = { userId: 11, isActive: true, mustChangePassword: false, fullName: 'ชื่อเก่า' };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValueOnce(existingUser),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const service = makeService(usersRepo);

      await service.loginWithSso({ accessToken: 'tok' });

      expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'สมหญิง ใจงาม' }));
    });

    it('does not overwrite an existing fullName when Azure AD sends no name this time', async () => {
      supabaseIdentity.verifyAccessToken.mockResolvedValue({
        supabaseUserId: 'uuid-8',
        email: 'existing.person2@millimedthailand.com',
        provider: 'azure',
        fullName: null,
      });
      const existingUser = { userId: 12, isActive: true, mustChangePassword: false, fullName: 'ชื่อเดิม' };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValueOnce(existingUser),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const service = makeService(usersRepo);

      await service.loginWithSso({ accessToken: 'tok' });

      // usersRepo.save ยังถูกเรียกจาก issueTokens() เพื่อบันทึก refreshTokenHash อยู่ดี แต่ fullName เดิมต้องไม่ถูกเขียนทับ
      expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'ชื่อเดิม' }));
    });
  });

  describe('completeEmployeeProfile', () => {
    it('rejects when the account is already linked to an employee', async () => {
      const usersRepo = { findOne: jest.fn().mockResolvedValue({ userId: 1, employeeId: 5 }) } as any;
      const service = new AuthService(
        usersRepo,
        employeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
        notificationsService,
        departmentsRepo,
      );

      await expect(
        service.completeEmployeeProfile(1, { employeeCode: 'EMP-0001', fullName: 'สมชาย ใจดี' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when the employeeCode is already taken', async () => {
      const usersRepo = { findOne: jest.fn().mockResolvedValue({ userId: 1, employeeId: null }) } as any;
      const localEmployeesRepo = { findOne: jest.fn().mockResolvedValue({ employeeId: 99 }) } as any;
      const service = new AuthService(
        usersRepo,
        localEmployeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
        notificationsService,
        departmentsRepo,
      );

      await expect(
        service.completeEmployeeProfile(1, { employeeCode: 'EMP-0001', fullName: 'สมชาย ใจดี' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the employee record and links it to the current user', async () => {
      const user = { userId: 1, employeeId: null, email: 'new.person@millimedthailand.com' };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const createdEmployee = { employeeId: 42, employeeCode: 'EMP-0001', fullName: 'สมชาย ใจดี' };
      const adminEmployees = [{ employeeId: 7 }, { employeeId: 8 }];
      const queryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(adminEmployees),
      };
      const localEmployeesRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdEmployee),
        save: jest.fn().mockResolvedValue(createdEmployee),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      } as any;
      const localNotificationsService = { notify: jest.fn().mockResolvedValue(null) } as any;
      const service = new AuthService(
        usersRepo,
        localEmployeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
        localNotificationsService,
        departmentsRepo,
      );

      const result = await service.completeEmployeeProfile(1, {
        employeeCode: 'EMP-0001',
        fullName: 'สมชาย ใจดี',
        departmentId: 3,
        position: 'Engineer',
      });

      expect(localEmployeesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeCode: 'EMP-0001',
          fullName: 'สมชาย ใจดี',
          departmentId: 3,
          position: 'Engineer',
          email: 'new.person@millimedthailand.com',
        }),
      );
      expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 42 }));
      expect(result).toEqual({ success: true });

      // แจ้งเตือนทุกคนที่มีสิทธิ์ rbac.manage (พบ 2 คนจาก queryBuilder mock) ว่ามีคนกรอกโปรไฟล์เสร็จแล้ว
      expect(localNotificationsService.notify).toHaveBeenCalledTimes(2);
      expect(localNotificationsService.notify).toHaveBeenCalledWith(
        7,
        'employee_profile_completed',
        expect.any(String),
        expect.stringContaining('EMP-0001'),
        'employee',
        42,
      );
    });

    it('does not fail the request when notifying admins throws', async () => {
      const user = { userId: 1, employeeId: null, email: 'new.person2@millimedthailand.com' };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const createdEmployee = { employeeId: 43, employeeCode: 'EMP-0002', fullName: 'สมหญิง ใจงาม' };
      const localEmployeesRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdEmployee),
        save: jest.fn().mockResolvedValue(createdEmployee),
        createQueryBuilder: jest.fn().mockImplementation(() => {
          throw new Error('db unavailable');
        }),
      } as any;
      const localNotificationsService = { notify: jest.fn() } as any;
      const service = new AuthService(
        usersRepo,
        localEmployeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
        localNotificationsService,
        departmentsRepo,
      );

      const result = await service.completeEmployeeProfile(1, {
        employeeCode: 'EMP-0002',
        fullName: 'สมหญิง ใจงาม',
      });

      expect(result).toEqual({ success: true });
      expect(localNotificationsService.notify).not.toHaveBeenCalled();
    });

    it('creates a new department when newDepartmentName has no existing match, and links it', async () => {
      const user = { userId: 1, employeeId: null, email: 'new.person3@millimedthailand.com' };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const createdEmployee = { employeeId: 44, employeeCode: 'EMP-0003', fullName: 'สมศักดิ์ มั่นคง' };
      const localEmployeesRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdEmployee),
        save: jest.fn().mockResolvedValue(createdEmployee),
        createQueryBuilder: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      } as any;
      const newDepartment = { departmentId: 77, departmentName: 'คลังสินค้า' };
      const localDepartmentsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        }),
        create: jest.fn().mockReturnValue(newDepartment),
        save: jest.fn().mockResolvedValue(newDepartment),
      } as any;
      const service = new AuthService(
        usersRepo,
        localEmployeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
        notificationsService,
        localDepartmentsRepo,
      );

      await service.completeEmployeeProfile(1, {
        employeeCode: 'EMP-0003',
        fullName: 'สมศักดิ์ มั่นคง',
        newDepartmentName: '  คลังสินค้า  ',
      });

      expect(localDepartmentsRepo.create).toHaveBeenCalledWith({ departmentName: 'คลังสินค้า' });
      expect(localEmployeesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 77 }));
    });

    it('reuses an existing department with a case-insensitive matching name instead of creating a duplicate', async () => {
      const user = { userId: 1, employeeId: null, email: 'new.person4@millimedthailand.com' };
      const usersRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      } as any;
      const createdEmployee = { employeeId: 45 };
      const localEmployeesRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdEmployee),
        save: jest.fn().mockResolvedValue(createdEmployee),
        createQueryBuilder: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      } as any;
      const existingDepartment = { departmentId: 12, departmentName: 'IT' };
      const localDepartmentsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(existingDepartment),
        }),
        create: jest.fn(),
        save: jest.fn(),
      } as any;
      const service = new AuthService(
        usersRepo,
        localEmployeesRepo,
        jwtService,
        config,
        jwtStrategy,
        mailService,
        allowedDomainsService,
        supabaseIdentity,
        notificationsService,
        localDepartmentsRepo,
      );

      await service.completeEmployeeProfile(1, {
        employeeCode: 'EMP-0004',
        fullName: 'สมศรี ยั่งยืน',
        newDepartmentName: 'it',
      });

      expect(localDepartmentsRepo.create).not.toHaveBeenCalled();
      expect(localEmployeesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 12 }));
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
        notificationsService,
        departmentsRepo,
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
        notificationsService,
        departmentsRepo,
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
