import { BadRequestException } from '@nestjs/common';
import { requireEmployeeId } from './require-employee-id.util';

describe('requireEmployeeId', () => {
  it('returns employeeId when present', () => {
    expect(requireEmployeeId({ employeeId: 42 })).toBe(42);
  });

  it('throws BadRequestException when employeeId is null', () => {
    expect(() => requireEmployeeId({ employeeId: null })).toThrow(BadRequestException);
  });
});
