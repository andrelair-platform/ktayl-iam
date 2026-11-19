import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest } from 'express';
import type { AuthUser } from '../auth/oidc.strategy.js';
import type { AppConfig } from '../config/configuration.js';
import { AdminOnly } from '../auth/admin-only.decorator.js';
import { DecideDto } from '../workflow/dto/decide.dto.js';
import { ExternalCollaboratorWorkflowService } from './external-collaborator-workflow.service.js';
import { ExternalCollaboratorService } from './external-collaborator.service.js';
import { CreateExternalCollaboratorRequestDto } from './dto/create-external-collaborator-request.dto.js';

function actorOf(req: ExpressRequest): string {
  return (req.user as AuthUser | undefined)?.username ?? 'unknown';
}

/**
 * Governed external-collaborator API (IGA-07 / S026). **IT/Admin-only** (`collaborators:manage`) — a
 * human non-employee is a privileged identity that bypasses the HR lifecycle, so onboarding one is never
 * employee self-service. File a request (Sponsor + Security dual-approved before provisioning), decide a
 * leg, and read requests/collaborators. SSO-gated + @AdminOnly; the acting principal is audited.
 */
@AdminOnly()
@Controller('collaborators')
export class ExternalCollaboratorsController {
  private readonly allowOverride: boolean;

  constructor(
    private readonly workflow: ExternalCollaboratorWorkflowService,
    private readonly collaborators: ExternalCollaboratorService,
    config: ConfigService,
  ) {
    this.allowOverride = config.get<AppConfig['workflow']>('workflow')!.allowApproverOverride;
  }

  @Post('requests')
  fileRequest(@Body() dto: CreateExternalCollaboratorRequestDto, @Req() req: ExpressRequest) {
    return this.workflow.fileRequest(
      {
        name: dto.name,
        displayName: dto.displayName,
        email: dto.email,
        type: dto.type,
        sponsorMatricule: dto.sponsorMatricule,
        groupRefs: dto.groupRefs,
        purpose: dto.purpose,
        expiryDays: dto.expiryDays,
      },
      actorOf(req),
    );
  }

  @Get('requests')
  listRequests() {
    return this.workflow.list();
  }

  @Get('requests/:id')
  getRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.findById(id);
  }

  @Post('requests/:id/decide')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideDto,
    @Req() req: ExpressRequest,
  ) {
    const actor = actorOf(req);
    // ALLOW_APPROVER_OVERRIDE (dev) lets an admin act as a named sponsor/Security approver to demo the
    // four-eyes; the server still rejects self-approval + any non-assigned approver. Actor is audited.
    const approver = this.allowOverride && dto.approver ? dto.approver : actor;
    return this.workflow.decide(id, approver, dto.decision, dto.comment, actor);
  }

  @Get()
  listCollaborators() {
    return this.collaborators.list();
  }
}
