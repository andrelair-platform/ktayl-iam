import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { AppConfig } from '../config/configuration.js';

/**
 * Machine auth for a single internal endpoint (ADR-013): the n8n integration presents a shared
 * **`X-IAM-Service-Key`** to call the `hr-worker-ref` writeback (which no human session reaches). Applied
 * at the route with `@UseGuards(ServiceKeyGuard)` on a `@Public()` route (so the session/admin guards step
 * aside). **Fail-closed:** a blank `IAM_SERVICE_KEY` denies every call, so the endpoint is inert until the
 * secret is wired (Vault→ESO). Constant-time compare. Upgrade path: Authentik M2M + JWKS when warranted.
 */
@Injectable()
export class ServiceKeyGuard implements CanActivate {
  private readonly expected: string;

  constructor(config: ConfigService) {
    this.expected = config.get<AppConfig['integration']>('integration')!.serviceKey;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.expected) {
      throw new UnauthorizedException('service endpoint disabled (no IAM_SERVICE_KEY configured)');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const presented = (req.headers['x-iam-service-key'] as string | undefined) ?? '';
    const a = Buffer.from(presented);
    const b = Buffer.from(this.expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('invalid service key');
    }
    return true;
  }
}
