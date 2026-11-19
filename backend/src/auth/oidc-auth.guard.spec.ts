import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthGuard } from '@nestjs/passport';
import { OidcAuthGuard } from './oidc-auth.guard.js';

function ctxWith(user: unknown) {
  const req = { user };
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

// super.canActivate / super.logIn live on the AuthGuard mixin base = the guard instance's
// grandparent prototype. Spy there to intercept the `super.*` calls.
function spySuper(guard: OidcAuthGuard) {
  const base = Object.getPrototypeOf(Object.getPrototypeOf(guard));
  return {
    canActivate: vi.spyOn(base, 'canActivate').mockResolvedValue(true as any),
    logIn: vi.spyOn(base, 'logIn').mockResolvedValue(undefined as any),
  };
}

describe('OidcAuthGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('establishes the passport session (super.logIn) after a successful callback (req.user set)', async () => {
    const guard = new OidcAuthGuard();
    const sup = spySuper(guard);
    const ok = await guard.canActivate(ctxWith({ id: '100001', username: '100001' }));
    expect(ok).toBe(true);
    expect(sup.logIn).toHaveBeenCalledTimes(1); // the fix: without this, passport.user is never persisted
  });

  it('does NOT log in on /login (no req.user yet — super.canActivate redirects to Authentik)', async () => {
    const guard = new OidcAuthGuard();
    const sup = spySuper(guard);
    await guard.canActivate(ctxWith(undefined));
    expect(sup.logIn).not.toHaveBeenCalled();
  });

  it('does not log in when the guard denies (result false)', async () => {
    const guard = new OidcAuthGuard();
    const base = Object.getPrototypeOf(Object.getPrototypeOf(guard));
    vi.spyOn(base, 'canActivate').mockResolvedValue(false as any);
    const logIn = vi.spyOn(base, 'logIn').mockResolvedValue(undefined as any);
    await guard.canActivate(ctxWith({ id: '100001' }));
    expect(logIn).not.toHaveBeenCalled();
  });
});
