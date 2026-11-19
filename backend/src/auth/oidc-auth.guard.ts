import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

/**
 * Triggers the Authentik OIDC flow on `/auth/login` and completes it on `/auth/callback`.
 *
 * **Why the `canActivate` override exists (the "please sign in" loop fix).** The base `AuthGuard`
 * validates the authorization code and sets `req.user` for *that one request*, but it does NOT
 * establish the passport **session**. So the callback redirect worked while `passport.user` was
 * never serialized into the session store — every later request (`GET /auth/me`) then saw no session
 * user → 401, and the UI bounced back to "please sign in" even though the token exchange returned
 * 200. (Proven live: the `session` rows carried only the pre-login `openidconnect:…state` handle and
 * never a `passport.user`.) We must explicitly `super.logIn(req)` after a successful callback so
 * `serializeUser` writes the user into the session (passport ≥0.6 regenerates the session id and
 * saves it). This runs in `canActivate` — before the controller's redirect — so express-session
 * persists the authenticated session on the callback response.
 */
@Injectable()
export class OidcAuthGuard extends AuthGuard('openidconnect') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    const req = context.switchToHttp().getRequest<Request>();
    // Only on the callback does the code exchange set `req.user`; on `/login`, `super.canActivate`
    // issues the redirect to Authentik and there is no user yet — don't attempt a session login then.
    if (result && req.user) {
      await super.logIn(req);
    }
    return result;
  }
}
