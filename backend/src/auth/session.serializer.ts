import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import type { AuthUser } from './oidc.strategy.js';

/** Store the whole (small) user object in the session — no separate user store in v1. */
@Injectable()
export class SessionSerializer extends PassportSerializer {
  serializeUser(user: AuthUser, done: (err: Error | null, user: AuthUser) => void) {
    done(null, user);
  }

  deserializeUser(payload: AuthUser, done: (err: Error | null, user: AuthUser) => void) {
    done(null, payload);
  }
}
