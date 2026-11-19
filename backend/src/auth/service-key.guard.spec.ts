import { describe, it, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ServiceKeyGuard } from './service-key.guard.js';

function ctx(headerValue?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: headerValue === undefined ? {} : { 'x-iam-service-key': headerValue } }),
    }),
  } as any;
}
function guard(serviceKey: string) {
  return new ServiceKeyGuard({ get: () => ({ serviceKey }) } as any);
}

describe('ServiceKeyGuard (ADR-013)', () => {
  it('fail-closed: a blank IAM_SERVICE_KEY denies every call', () => {
    expect(() => guard('').canActivate(ctx('anything'))).toThrow(UnauthorizedException);
  });

  it('accepts the correct key', () => {
    expect(guard('s3cr3t-key').canActivate(ctx('s3cr3t-key'))).toBe(true);
  });

  it('rejects a wrong key', () => {
    expect(() => guard('s3cr3t-key').canActivate(ctx('nope'))).toThrow(UnauthorizedException);
  });

  it('rejects a missing header', () => {
    expect(() => guard('s3cr3t-key').canActivate(ctx(undefined))).toThrow(UnauthorizedException);
  });
});
