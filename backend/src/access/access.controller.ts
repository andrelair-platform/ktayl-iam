import { Controller, Get, Param, ParseUUIDPipe, Query, Req, Res } from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import type { AuthUser } from '../auth/oidc.strategy.js';
import { AccessService } from './access.service.js';
import { AdminOnly } from '../auth/admin-only.decorator.js';

/**
 * The access-visibility + audit API. The **who-has-what + audit** evidence views (S006) are
 * **admin/auditor-only** (`@AdminOnly()` per method, threat T7). The ADR-017 **`GET /access/me`** is
 * **self-service** — any authenticated user, their OWN access only (the matricule comes from the session,
 * never the path). Read-only throughout — grants only ever change via request → four-eyes.
 */
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  /** ADR-017 — the signed-in user's complete access picture (governed grants + birthright/direct groups). */
  @Get('me')
  me(@Req() req: ExpressRequest) {
    const matricule = (req.user as AuthUser | undefined)?.username ?? 'unknown';
    return this.access.forUserComplete(matricule);
  }

  @AdminOnly()
  @Get('users/:matricule')
  forUser(@Param('matricule') matricule: string) {
    return this.access.forUser(matricule);
  }

  @AdminOnly()
  @Get('applications/:id')
  forApplication(@Param('id', ParseUUIDPipe) id: string) {
    return this.access.forApplication(id);
  }

  @AdminOnly()
  @Get('matrix')
  matrix() {
    return this.access.matrix();
  }

  @AdminOnly()
  @Get('audit')
  audit(@Query('entityType') entityType?: string, @Query('limit') limit?: string) {
    return this.access.listAudit(entityType, limit ? Number(limit) : undefined);
  }

  @AdminOnly()
  @Get('audit/export')
  async exportAudit(@Query('format') format: string | undefined, @Res() res: Response) {
    const fmt = format === 'csv' ? 'csv' : 'json';
    const out = await this.access.exportAudit(fmt);
    res
      .status(200)
      .setHeader('Content-Type', out.contentType)
      .setHeader('Content-Disposition', `attachment; filename="${out.filename}"`)
      .send(out.body);
  }
}
