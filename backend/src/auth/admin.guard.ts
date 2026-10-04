import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ADMIN_ONLY_KEY } from './admin-only.decorator.js';
import type { AuthUser } from './oidc.strategy.js';

/**
 * S009 authorization gate. Runs after the AuthenticatedGuard (session already guaranteed). For routes
 * (or controllers) marked `@AdminOnly()` it requires `AuthUser.isAdmin` — otherwise 403. Un-decorated
 * routes pass (open to any authenticated requester/approver; finer-grained checks — self-only requests,
 * approver-is-an-assigned-leg — live in the workflow layer). Registered as a global APP_GUARD.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!adminOnly) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthUser | undefined;
    if (user?.isAdmin) return true;
    throw new ForbiddenException('This action requires the Access Governance admin role.');
  }
}
