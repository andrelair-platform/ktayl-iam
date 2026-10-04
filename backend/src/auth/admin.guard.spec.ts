import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { ADMIN_USER, NON_ADMIN_USER } from '../../test/fixtures/users.js';

/** Minimal ExecutionContext double exposing the handler/class + the request user. */
function ctx(user: unknown) {
  return {
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}
/** Reflector double whose getAllAndOverride returns a fixed @AdminOnly value. */
function guardWith(adminOnly: boolean) {
  return new AdminGuard({ getAllAndOverride: () => adminOnly } as any);
}

describe('AdminGuard (S009)', () => {
  it('passes any authenticated user on an un-decorated route', () => {
    expect(guardWith(false).canActivate(ctx(NON_ADMIN_USER))).toBe(true);
  });

  it('passes an admin on an @AdminOnly route', () => {
    expect(guardWith(true).canActivate(ctx(ADMIN_USER))).toBe(true);
  });

  it('403s a non-admin on an @AdminOnly route', () => {
    expect(() => guardWith(true).canActivate(ctx(NON_ADMIN_USER))).toThrow(ForbiddenException);
  });

  it('403s when there is no user on an @AdminOnly route', () => {
    expect(() => guardWith(true).canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
