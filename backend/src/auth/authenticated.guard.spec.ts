import { describe, it, expect } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedGuard } from './authenticated.guard.js';

/** Minimal ExecutionContext stub carrying a request + the handler/class for the Reflector. */
function ctx(req: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardWithPublic(isPublic: boolean) {
  const reflector = {
    getAllAndOverride: () => isPublic,
  } as unknown as Reflector;
  return new AuthenticatedGuard(reflector);
}

describe('AuthenticatedGuard', () => {
  it('allows a @Public() route without a session', () => {
    const guard = guardWithPublic(true);
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it('allows an authenticated request on a protected route', () => {
    const guard = guardWithPublic(false);
    expect(guard.canActivate(ctx({ isAuthenticated: () => true }))).toBe(true);
  });

  it('rejects an unauthenticated request on a protected route (401)', () => {
    const guard = guardWithPublic(false);
    expect(() => guard.canActivate(ctx({ isAuthenticated: () => false }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the request has no passport isAuthenticated helper', () => {
    const guard = guardWithPublic(false);
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });
});
