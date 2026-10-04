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
  /** S008: true iff the user is in the admin group — drives the @AdminOnly authorization gate (S009). */
  isAdmin: boolean;
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
 * Pure authorization decision from the raw passport verify args: extract groups + profile, apply the
 * login gate, and shape the AuthUser. **S008 multi-user login:** any authenticated user is admitted
 * (so employees can be requesters/approvers), and `isAdmin` is derived from admin-group membership —
 * authorization per-capability is then enforced by the @AdminOnly gate (S009), NOT at login. If a
 * `staffGroup` is configured, membership in it (or the admin group) is REQUIRED — else any
 * authenticated user passes. Exported so it's unit-testable against the exact passport arg shapes.
 */
export function authorizeFromVerifyArgs(args: any[], adminGroup: string, staffGroup = ''): AuthUser {
  const groups = collectGroups(args);
  const profile = pickProfile(args);
  const isAdmin = groups.includes(adminGroup);
  if (staffGroup && !isAdmin && !groups.includes(staffGroup)) {
    throw new UnauthorizedException(
      `Not authorised for the Access Governance console (membership of "${staffGroup}" required).`,
    );
  }
  return {
    id: profile.id,
    username: profile.username ?? profile.displayName ?? profile.id,
    email: profile.emails?.[0]?.value ?? profile._json?.email,
    groups,
    isAdmin,
  };
}

/**
 * Authentik OIDC (auth-code flow). S008 MULTI-USER: any authenticated Authentik user is admitted
 * (optionally gated on STAFF_GROUP); admin-group membership sets `isAdmin`, and the @AdminOnly guard
 * (S009) enforces per-capability authorization — login is no longer admin-only.
 */
@Injectable()
// callbackArity 5 → passport-openidconnect passes (iss, profile, context, idToken, done), so
// validate() receives the raw ID token (JWT) whose claims carry `groups`. Arity matters: its
// dispatch table only has branches for 9/8/7/5/4 (else→3) — 6 is NOT a branch and silently
// falls through to the 3-arg (iss, profile, done) shape with no idToken. 5 is the smallest
// arity that includes idToken. (@nestjs/passport sets the callback's .length to this value.)
export class OidcStrategy extends PassportStrategy(Strategy, 'openidconnect', 5) {
  private readonly adminGroup: string;
  private readonly staffGroup: string;

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
    this.staffGroup = o.staffGroup;
  }

  validate(...args: any[]): AuthUser {
    return authorizeFromVerifyArgs(args, this.adminGroup, this.staffGroup);
  }
}
