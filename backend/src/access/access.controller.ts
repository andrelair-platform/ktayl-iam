import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AccessService } from './access.service.js';
import { AdminOnly } from '../auth/admin-only.decorator.js';

/**
 * The who-has-what + audit evidence API (S006). Admin/auditor-only via the global
 * AuthenticatedGuard (threat T7). Read-only — the audit trail is append-only at the DB level.
 */
@AdminOnly() // S009 (threat T7): who-has-what + audit are admin/auditor-only
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('users/:matricule')
  forUser(@Param('matricule') matricule: string) {
    return this.access.forUser(matricule);
  }

  @Get('applications/:id')
  forApplication(@Param('id', ParseUUIDPipe) id: string) {
    return this.access.forApplication(id);
  }

  @Get('matrix')
  matrix() {
    return this.access.matrix();
  }

  @Get('audit')
  audit(@Query('entityType') entityType?: string, @Query('limit') limit?: string) {
    return this.access.listAudit(entityType, limit ? Number(limit) : undefined);
  }

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
