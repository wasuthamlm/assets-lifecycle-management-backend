import { PermissionCacheService } from './permission-cache.service';

const entry = (userId: number, employeeId: number | null) => ({
  userId,
  username: `u${userId}`,
  employeeId,
  permissions: [],
  roles: [],
  mustChangePassword: false,
});

describe('PermissionCacheService', () => {
  it('invalidateEmployee drops only the users linked to that employee', () => {
    const cache = new PermissionCacheService();
    cache.set(entry(1, 10));
    cache.set(entry(2, 20));

    cache.invalidateEmployee(10);

    expect(cache.get(1)).toBeNull();
    expect(cache.get(2)).not.toBeNull();
  });

  it('expires entries after the TTL', () => {
    jest.useFakeTimers();
    const cache = new PermissionCacheService();
    cache.set(entry(1, 10));
    jest.advanceTimersByTime(30_001);
    expect(cache.get(1)).toBeNull();
    jest.useRealTimers();
  });
});
