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

/**
 * passport-openidconnect passes the profile in different arg positions depending on the
 * verify arity (with @nestjs/passport the arity is variadic). Be robust: scan EVERY arg
 * (and its `_json` = the raw userinfo/id_token claims) for a `groups` array.
 */
function collectGroups(args: any[]): string[] {
  const found = new Set<string>();
  for (const a of args) {
    if (a && typeof a === 'object') {
      asStringArray(a.groups).forEach((g) => found.add(g));
      asStringArray(a._json?.groups).forEach((g) => found.add(g));
    }
  }
  return [...found];
}

function pickProfile(args: any[]): any {
  return args.find((a) => a && typeof a === 'object' && (a._json || a.id || a.emails)) ?? {};
}

/**
 * Authentik OIDC (auth-code flow). ADMIN-ONLY: a user is accepted only if they are a member
 * of the admin group (ADMIN_GROUP). Everyone else is rejected at login (401) — this is the
 * platform's own gate, distinct from the per-app authorization it will later manage.
 */
@Injectable()
export class OidcStrategy extends PassportStrategy(Strategy, 'openidconnect') {
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
    const groups = collectGroups(args);
    const profile = pickProfile(args);

    // TEMP diagnostic (S001): show exactly what the strategy receives, to pin the groups claim.
    // eslint-disable-next-line no-console
    console.log(
      '[oidc.validate] argc=%d adminGroup=%j groups=%j argShapes=%j',
      args.length,
      this.adminGroup,
      groups,
      args.map((a) =>
        a && typeof a === 'object'
          ? { keys: Object.keys(a).slice(0, 8), jsonKeys: a._json ? Object.keys(a._json) : undefined }
          : typeof a,
      ),
    );

    if (!groups.includes(this.adminGroup)) {
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
}
