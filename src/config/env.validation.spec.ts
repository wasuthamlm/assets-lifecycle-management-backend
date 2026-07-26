import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  it('passes when JWT secrets are provided', () => {
    const { error } = envValidationSchema.validate({
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
    });
    expect(error).toBeUndefined();
  });

  it('fails when JWT_ACCESS_SECRET is missing', () => {
    const { error } = envValidationSchema.validate({ JWT_REFRESH_SECRET: 'refresh-secret' });
    expect(error?.message).toContain('JWT_ACCESS_SECRET');
  });

  it('fails when JWT_REFRESH_SECRET is missing', () => {
    const { error } = envValidationSchema.validate({ JWT_ACCESS_SECRET: 'access-secret' });
    expect(error?.message).toContain('JWT_REFRESH_SECRET');
  });

  it('fills in defaults for optional keys', () => {
    const { value } = envValidationSchema.validate({
      JWT_ACCESS_SECRET: 'a',
      JWT_REFRESH_SECRET: 'b',
    });
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(3000);
    expect(value.DB_HOST).toBe('localhost');
  });
});
