import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest } from 'express';
import type { AuthUser } from '../auth/oidc.strategy.js';
import type { AppConfig } from '../config/configuration.js';
import { WorkflowService } from './workflow.service.js';
import { CreateRequestDto } from './dto/create-request.dto.js';
import { DecideDto } from './dto/decide.dto.js';

/** matricule of the signed-in admin (the global AuthenticatedGuard guarantees a session). */
function actorOf(req: ExpressRequest): string {
  return (req.user as AuthUser | undefined)?.username ?? 'unknown';
}

/**
 * The dual-approval workflow API (S004). File a request, decide a leg, and read requests (the
 * approvals queue / a user's requests). Admin-only via the global AuthenticatedGuard — the
 * platform is an admin console today; `requesterId`/approver matricules model the real actors.
 */
@Controller('requests')
export class RequestsController {
  private readonly allowOverride: boolean;

  constructor(
    private readonly workflow: WorkflowService,
    config: ConfigService,
  ) {
    this.allowOverride = config.get<AppConfig['workflow']>('workflow')!.allowApproverOverride;
  }

  @Post()
  create(@Body() dto: CreateRequestDto, @Req() req: ExpressRequest) {
    const actor = actorOf(req);
    const requester = dto.requesterId ?? actor;
    return this.workflow.createRequest(requester, dto.roleId, actor);
  }

  @Get()
  list(
    @Query('approver') approver?: string,
    @Query('requester') requester?: string,
    @Query('status') status?: string,
  ) {
    return this.workflow.listRequests({ approver, requester, status });
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.getRequest(id);
  }

  @Post(':id/decide')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideDto,
    @Req() req: ExpressRequest,
  ) {
    const actor = actorOf(req);
    // The approver is the signed-in user (true four-eyes). ALLOW_APPROVER_OVERRIDE (dev only) lets
    // an admin act as a specific approver to demo both legs; the server still rejects self-approval
    // and any approver not assigned to a leg, so the control is never bypassed — only impersonated
    // in dev. The real signed-in user is always recorded as the audit `actor`.
    const approver = this.allowOverride && dto.approver ? dto.approver : actor;
    return this.workflow.decide(id, approver, dto.decision, dto.comment, actor);
  }

  @Post('assignments/:id/revoke')
  revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: ExpressRequest) {
    return this.workflow.revoke(id, actorOf(req));
  }
}
