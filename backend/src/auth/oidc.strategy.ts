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

function extractGroups(profile: any): string[] {
  const raw = profile?._json?.groups ?? profile?.groups ?? [];
  return Array.isArray(raw) ? raw.map(String) : [];
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

  validate(issuer: string, profile: any): AuthUser {
    const groups = extractGroups(profile);
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
