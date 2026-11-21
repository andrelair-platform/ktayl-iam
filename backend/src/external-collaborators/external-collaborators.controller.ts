import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest } from 'express';
import type { AuthUser } from '../auth/oidc.strategy.js';
import type { AppConfig } from '../config/configuration.js';
import { AdminOnly } from '../auth/admin-only.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ServiceKeyGuard } from '../auth/service-key.guard.js';
import { DecideDto } from '../workflow/dto/decide.dto.js';
import { ExternalCollaboratorWorkflowService } from './external-collaborator-workflow.service.js';
import { ExternalCollaboratorService } from './external-collaborator.service.js';
import { ExternalCollaboratorProvisioningService } from './external-collaborator-provisioning.service.js';
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
    private readonly provisioning: ExternalCollaboratorProvisioningService,
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
        company: dto.company,
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
    return this.workflow.decide({ requestId: id, approver: approver, decision: dto.decision, comment: dto.comment, actor: actor });
  }

  /** Re-run provisioning for an approved collaborator whose auto-provision failed (S027). Idempotent, audited. */
  @Post(':id/provision')
  provision(@Param('id', ParseUUIDPipe) id: string, @Req() req: ExpressRequest) {
    return this.provisioning.provision(id, actorOf(req));
  }

  /**
   * Bind the ERPNext **HR worker ref** (ADR-012/013) — the `HR-EMP-xxxxx` id of the non-payroll worker
   * record **n8n** created for this collaborator on the `onboarded` event. A **machine** endpoint: `@Public()`
   * (no human session) + `ServiceKeyGuard` (the `X-IAM-Service-Key` header, fail-closed). n8n calls it to
   * write the id back; IAM never creates/writes the ERPNext record. Idempotent + audited.
   */
  @Public()
  @UseGuards(ServiceKeyGuard)
  @Post(':id/hr-worker-ref')
  bindHrWorker(@Param('id', ParseUUIDPipe) id: string, @Body() body: { hrWorkerRef?: string }) {
    const ref = (body?.hrWorkerRef ?? '').trim();
    if (!ref) {
      throw new BadRequestException('hrWorkerRef is required');
    }
    // The caller is the n8n integration authenticated by the service key — audited as such, not a human.
    return this.collaborators.setHrWorkerRef(id, ref, 'service:n8n');
  }

  /** Active collaborators expiring within `?days=` (default 30) — the renewal worklist (S028). */
  @Get('due')
  due(@Query('days') days?: string) {
    const d = Number(days ?? 30);
    return this.collaborators.listDueForRenewal(Number.isFinite(d) && d > 0 ? d : 30);
  }

  /** Renew an active engagement — extend the expiry (capped at the 180d ceiling), stamp recert (S028). */
  @Post(':id/renew')
  renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { days?: number },
    @Req() req: ExpressRequest,
  ) {
    return this.collaborators.renew(id, actorOf(req), body?.days);
  }

  @Get()
  listCollaborators() {
    return this.collaborators.list();
  }
}
