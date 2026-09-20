import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Triggers the Authentik OIDC flow on /auth/login and completes it on /auth/callback. */
@Injectable()
export class OidcAuthGuard extends AuthGuard('openidconnect') {}
