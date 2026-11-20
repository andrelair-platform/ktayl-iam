import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest } from 'express';
import type { AuthUser } from '../auth/oidc.strategy.js';
import type { AppConfig } from '../config/configuration.js';
import { AdminOnly } from '../auth/admin-only.decorator.js';
import { WorkflowService } from './workflow.service.js';
import { CreateRequestDto } from './dto/create-request.dto.js';
import { CreateBatchRequestDto } from './dto/create-batch-request.dto.js';
import { DecideDto } from './dto/decide.dto.js';

/** matricule of the signed-in user (the global AuthenticatedGuard guarantees a session). */
function actorOf(req: ExpressRequest): string {
  return (req.user as AuthUser | undefined)?.username ?? 'unknown';
}
function isAdminOf(req: ExpressRequest): boolean {
  return Boolean((req.user as AuthUser | undefined)?.isAdmin);
}

/**
 * The dual-approval workflow API (S004) with multi-user authorization (S009). Any authenticated user
 * may file their OWN request, read their own/to-approve requests, and decide a leg they're assigned.
 * Admin-only actions (file-on-behalf, see-all, revoke) are gated by `@AdminOnly()` / server checks.
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
    // S009 AC-5 (D3): a non-admin may only request for THEMSELVES; only an admin may file on behalf.
    if (dto.requesterId && dto.requesterId !== actor && !isAdminOf(req)) {
      throw new ForbiddenException('You can only request access for yourself.');
    }
    const requester = isAdminOf(req) ? (dto.requesterId ?? actor) : actor;
    return this.workflow.createRequest(requester, dto.roleId, actor);
  }

  /** ADR-017 — file a BATCH (N roles as one demande under a trackable `batchId`). Each role keeps its own
   *  two-leg four-eyes. Non-admin may only batch-request for themselves; admin may file on behalf. */
  @Post('batch')
  createBatch(@Body() dto: CreateBatchRequestDto, @Req() req: ExpressRequest) {
    const actor = actorOf(req);
    if (dto.requesterId && dto.requesterId !== actor && !isAdminOf(req)) {
      throw new ForbiddenException('You can only request access for yourself.');
    }
    const requester = isAdminOf(req) ? (dto.requesterId ?? actor) : actor;
    return this.workflow.createBatchRequest(requester, dto.roleIds, actor, dto.label);
  }

  /** ADR-017 — the batch tracking view (which roles granted vs blocked + on which leg). Visible to the
   *  batch requester, any approver of a role in it, or an admin. */
  @Get('batch/:batchId')
  async getBatch(@Param('batchId', ParseUUIDPipe) batchId: string, @Req() req: ExpressRequest) {
    const batch = await this.workflow.getBatch(batchId);
    if (!isAdminOf(req)) {
      const actor = actorOf(req);
      const involved =
        batch.requester === actor ||
        batch.requests.some((r) => r.managerApprover === actor || r.ownerApprover === actor);
      if (!involved) throw new ForbiddenException('You can only view your own batches.');
    }
    return batch;
  }

  @Get()
  list(
    @Req() req: ExpressRequest,
    @Query('approver') approver?: string,
    @Query('requester') requester?: string,
    @Query('status') status?: string,
  ) {
    // S009 AC-3: an admin sees ALL requests (honours the filters); a non-admin sees ONLY their own
    // requests + the ones awaiting their approval — never the whole queue.
    if (isAdminOf(req)) {
      return this.workflow.listRequests({ approver, requester, status });
    }
    return this.workflow.listForUser(actorOf(req));
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

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: ExpressRequest) {
    // S010: any authenticated user; the service enforces "requester-only, still-pending".
    return this.workflow.cancel(id, actorOf(req));
  }

  @Post('assignments/:id/revoke')
  @AdminOnly() // S009: revoking someone's granted access is an admin action
  revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: ExpressRequest) {
    return this.workflow.revoke(id, actorOf(req));
  }
}
