import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest } from 'express';
import type { AuthUser } from '../auth/oidc.strategy.js';
import type { AppConfig } from '../config/configuration.js';
import { ServiceAccountWorkflowService } from './service-account-workflow.service.js';
import { ServiceAccountService } from './service-account.service.js';
import { CreateServiceAccountRequestDto } from './dto/create-service-account-request.dto.js';
import { DecideDto } from '../workflow/dto/decide.dto.js';

/** matricule of the signed-in user (the global AuthenticatedGuard guarantees a session). */
function actorOf(req: ExpressRequest): string {
  return (req.user as AuthUser | undefined)?.username ?? 'unknown';
}
function isAdminOf(req: ExpressRequest): boolean {
  return Boolean((req.user as AuthUser | undefined)?.isAdmin);
}

/**
 * Governed service-account API (IGA-06 / S022). File a request (dual-approved before anything is
 * provisioned), decide a leg, and read requests/accounts. Authorization: only an admin or the named
 * **owner** may file (you can't request a privileged account owned by someone else); the decide legs
 * are enforced in the service (the Security + owner approvers, four-eyes). SSO-gated by the global
 * AuthenticatedGuard; the acting principal is audited.
 */
@Controller('service-accounts')
export class ServiceAccountsController {
  private readonly allowOverride: boolean;

  constructor(
    private readonly workflow: ServiceAccountWorkflowService,
    private readonly accounts: ServiceAccountService,
    config: ConfigService,
  ) {
    this.allowOverride = config.get<AppConfig['workflow']>('workflow')!.allowApproverOverride;
  }

  @Post('requests')
  fileRequest(@Body() dto: CreateServiceAccountRequestDto, @Req() req: ExpressRequest) {
    const actor = actorOf(req);
    // Only an admin or the named owner may file — you cannot request a privileged service account
    // owned by someone else (governance; the owner is accountable for it).
    if (!isAdminOf(req) && dto.ownerMatricule !== actor) {
      throw new ForbiddenException('Only an admin or the named owner may request a service account.');
    }
    return this.workflow.fileRequest(
      {
        name: dto.name,
        displayName: dto.displayName,
        type: dto.type,
        ownerMatricule: dto.ownerMatricule,
        groupRefs: dto.groupRefs,
        justification: dto.justification,
      },
      actor,
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
    // ALLOW_APPROVER_OVERRIDE (dev only) lets an admin act as a specific approver to demo both legs;
    // the server still rejects self-approval + any approver not on a leg. The signed-in user is audited.
    const approver = this.allowOverride && dto.approver ? dto.approver : actor;
    return this.workflow.decide(id, approver, dto.decision, dto.comment, actor);
  }

  @Get()
  listAccounts() {
    return this.accounts.list();
  }
}
