import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-openidconnect';
import type { AppConfig } from '../config/configuration.js';

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  groups: string[];
}

function asStringArray(v: any): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

/** Decode a JWT payload (no verification — passport already verified the signature). */
export function decodeJwtPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Authentik returns `groups` in the ID-token claims (the provider has
 * include_claims_in_id_token=true + a `groups` scope mapping). passport-openidconnect only
 * surfaces those claims when the verify arity is high enough (we request arity 6 via
 * PassportStrategy so it passes iss, uiProfile, idProfile, context, idToken, done). Be robust:
 * scan EVERY arg for a `groups` array — an object's `.groups`/`._json.groups` (uiProfile /
 * idProfile) AND a raw id_token JWT string's decoded payload `.groups` (the reliable source).
 */
export function collectGroups(args: any[]): string[] {
  const found = new Set<string>();
  for (const a of args) {
    if (a && typeof a === 'object') {
      asStringArray(a.groups).forEach((g) => found.add(g));
      asStringArray(a._json?.groups).forEach((g) => found.add(g));
    } else if (typeof a === 'string' && a.split('.').length === 3) {
      asStringArray(decodeJwtPayload(a)?.groups).forEach((g) => found.add(g));
    }
  }
  return [...found];
}

export function pickProfile(args: any[]): any {
  return args.find((a) => a && typeof a === 'object' && (a._json || a.id || a.emails)) ?? {};
}

/**
 * Pure authorization decision from the raw passport verify args: extract groups + profile,
 * enforce the admin-group gate, and shape the AuthUser. Throws UnauthorizedException when the
 * user isn't a member of `adminGroup`. Exported so it can be unit-tested against the exact arg
 * shapes passport-openidconnect delivers (arity 3 = no groups → deny; arity 6 = id_token → allow).
 */
export function authorizeFromVerifyArgs(args: any[], adminGroup: string): AuthUser {
  const groups = collectGroups(args);
  const profile = pickProfile(args);
  if (!groups.includes(adminGroup)) {
    throw new UnauthorizedException(
      'Not authorised for the Access Governance console (admin group required).',
    );
  }
  return {
    id: profile.id,
    username: profile.username ?? profile.displayName ?? profile.id,
    email: profile.emails?.[0]?.value ?? profile._json?.email,
    groups,
  };
}

/**
 * Authentik OIDC (auth-code flow). ADMIN-ONLY: a user is accepted only if they are a member
 * of the admin group (ADMIN_GROUP). Everyone else is rejected at login (401) — this is the
 * platform's own gate, distinct from the per-app authorization it will later manage.
 */
@Injectable()
// callbackArity 5 → passport-openidconnect passes (iss, profile, context, idToken, done), so
// validate() receives the raw ID token (JWT) whose claims carry `groups`. Arity matters: its
// dispatch table only has branches for 9/8/7/5/4 (else→3) — 6 is NOT a branch and silently
// falls through to the 3-arg (iss, profile, done) shape with no idToken. 5 is the smallest
// arity that includes idToken. (@nestjs/passport sets the callback's .length to this value.)
export class OidcStrategy extends PassportStrategy(Strategy, 'openidconnect', 5) {
  private readonly adminGroup: string;

  constructor(config: ConfigService) {
    const o = config.get<AppConfig['oidc']>('oidc')!;
    super({
      issuer: o.issuer,
      authorizationURL: o.authorizationURL,
      tokenURL: o.tokenURL,
      userInfoURL: o.userInfoURL,
      clientID: o.clientID,
      clientSecret: o.clientSecret,
      callbackURL: o.callbackURL,
      scope: o.scope,
    });
    this.adminGroup = o.adminGroup;
  }

  validate(...args: any[]): AuthUser {
    // TEMP diagnostic (S001): show exactly what the strategy receives at runtime, to pin the
    // groups claim / verify arity. Remove once the login is confirmed working end-to-end.
    // eslint-disable-next-line no-console
    console.log(
      '[oidc.validate] argc=%d adminGroup=%j groups=%j argShapes=%j',
      args.length,
      this.adminGroup,
      collectGroups(args),
      args.map((a) =>
        a && typeof a === 'object'
          ? { keys: Object.keys(a).slice(0, 8), jsonKeys: a._json ? Object.keys(a._json) : undefined }
          : typeof a,
      ),
    );

    return authorizeFromVerifyArgs(args, this.adminGroup);
  }
}
