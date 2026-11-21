import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { AuditService } from '../catalog/audit.service.js';
import { AuthentikClient } from '../directory/authentik.client.js';
import { resolveApprovers } from '../workflow/approver-resolution.js';
import {
  ExternalCollaboratorRequest,
  type EcApprovalDecision,
} from './entities/external-collaborator-request.entity.js';
import {
  ExternalCollaboratorService,
  type CreateExternalCollaboratorInput,
} from './external-collaborator.service.js';
import { ExternalCollaboratorProvisioningService } from './external-collaborator-provisioning.service.js';

import { EXPIRY_CEILING_DAYS, EXPIRY_DEFAULT_DAYS } from './constants.js';

export type EcLeg = 'security' | 'sponsor';

export { EXPIRY_CEILING_DAYS, EXPIRY_DEFAULT_DAYS };

export interface FileExternalCollaboratorInput
  extends Omit<CreateExternalCollaboratorInput, 'createdBy' | 'expiresAt'> {
  expiryDays?: number;
}

/**
 * The governed external-collaborator request + **Sponsor + Security** dual-approval (IGA-07 / S026).
 * Reuses the pure four-eyes resolver (`resolveApprovers`) — "owner" leg → the **sponsor**, "manager"
 * leg → a **Security/Platform approver**. Enforces the governance rules at request time: a **mandatory
 * purpose**, the **sponsor must be an ACTIVE employee** (rejected otherwise), and the **expiry is capped
 * at the hard ceiling** (default 90d, max 180d). Nothing reaches Authentik here — both approvals leave
 * the request `approved` (the collaborator stays `requested`) and S027 provisions it.
 */
@Injectable()
export class ExternalCollaboratorWorkflowService {
  private readonly log = new Logger(ExternalCollaboratorWorkflowService.name);
  private readonly securityApprover: string;
  private readonly backupApprover: string;

  // eslint-disable-next-line max-params -- NestJS DI constructor (injected dependencies, cannot be an options object)
  constructor(
    @InjectRepository(ExternalCollaboratorRequest)
    private readonly requests: Repository<ExternalCollaboratorRequest>,
    private readonly collaborators: ExternalCollaboratorService,
    private readonly authentik: AuthentikClient,
    private readonly audit: AuditService,
    config: ConfigService,
    /** S027 provisioning. @Optional so the S026 unit tests construct the workflow without it. */
    @Optional()
    private readonly provisioning?: ExternalCollaboratorProvisioningService,
  ) {
    const dir = config.get<AppConfig['directory']>('directory')!;
    this.securityApprover = dir.securityApprover;
    this.backupApprover = dir.fallbackApprover;
  }

  /** File an onboarding request: validate sponsor+purpose+expiry, create the collaborator, resolve legs. */
  async fileRequest(
    input: FileExternalCollaboratorInput,
    actor: string,
  ): Promise<ExternalCollaboratorRequest> {
    if (!input.purpose || !input.purpose.trim()) {
      throw new UnprocessableEntityException('an external-collaborator request requires a purpose');
    }
    // Sponsor must be an ACTIVE employee. When Authentik is configured we validate it live; a
    // terminated/unknown sponsor is rejected (the orphaned-access guard starts at request time).
    if (this.authentik.configured && !(await this.authentik.isActiveUser(input.sponsorMatricule))) {
      throw new UnprocessableEntityException(
        `sponsor ${input.sponsorMatricule} is not an active employee`,
      );
    }

    const days = Math.min(input.expiryDays ?? EXPIRY_DEFAULT_DAYS, EXPIRY_CEILING_DAYS);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const collaborator = await this.collaborators.create({ ...input, expiresAt, createdBy: actor });

    // "owner" leg → the sponsor; "manager" leg → the Security approver.
    const resolution = resolveApprovers({
      requesterId: actor,
      managerFromHr: this.securityApprover,
      roleOwner: input.sponsorMatricule,
      backup: this.backupApprover,
    });

    const req = await this.requests.save(
      this.requests.create({
        requesterId: actor,
        collaboratorId: collaborator.id,
        sponsorApprover: resolution.ownerApprover,
        securityApprover: resolution.managerApprover,
        status: 'pending',
        sponsorDecision: null,
        securityDecision: null,
      }),
    );

    await this.audit.record({ actor: actor, action: 'external_collaborator.requested', entityType: 'external_collaborator_request', entityId: req.id, detail: {
        collaborator: collaborator.name,
        company: collaborator.company ?? 'freelance',
        sponsor: input.sponsorMatricule,
        groups: input.groupRefs,
        expiresAt: expiresAt.toISOString(),
        sponsorApprover: resolution.ownerApprover,
        securityApprover: resolution.managerApprover,
        purpose: collaborator.purpose,
        reassignments: resolution.notes,
        needsManualReview: resolution.needsManualReview,
      } });
    return req;
  }

  /** Record an approver's decision on their leg. Either denial rejects; both-approved → `approved`. */
  async decide(opts: {
    requestId: string;
    approver: string;
    decision: 'approved' | 'denied';
    comment: string | undefined;
    actor: string;
  }): Promise<ExternalCollaboratorRequest> {
    const { requestId, approver, decision, comment, actor } = opts;
    const req = await this.loadDecidableRequest(requestId, approver);
    const legs = this.resolveApproverLegs(req, approver);

    const entry: EcApprovalDecision = {
      approver,
      decision,
      at: new Date().toISOString(),
      ...(comment ? { comment } : {}),
    };
    await this.applyLegDecisions(req, legs, entry, { actor, approver, decision, comment });

    if (decision === 'denied') {
      req.status = 'denied';
      await this.requests.save(req);
      await this.audit.record({ actor: actor, action: 'external_collaborator.denied', entityType: 'external_collaborator_request', entityId: req.id, detail: { by: approver, legs } });
      return req;
    }

    const bothApproved =
      req.securityDecision?.decision === 'approved' && req.sponsorDecision?.decision === 'approved';
    if (!bothApproved) {
      await this.requests.save(req); // one leg in; still pending the other
      return req;
    }

    req.status = 'approved';
    await this.requests.save(req);
    await this.audit.record({ actor: actor, action: 'external_collaborator.approved', entityType: 'external_collaborator_request', entityId: req.id, detail: { collaboratorId: req.collaboratorId } });

    // S027 — best-effort provision to Authentik now the four-eyes gate has cleared. A failure is
    // retryable (POST /collaborators/:id/provision), audited, and does NOT un-approve the decision.
    if (this.provisioning) {
      try {
        await this.provisioning.provision(req.collaboratorId, actor);
      } catch (err) {
        this.log.warn(
          `auto-provisioning of ${req.collaboratorId} failed (retryable): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      this.log.log(`external-collaborator request ${req.id} approved — awaiting provisioning (S027)`);
    }
    return req;
  }

  /** Load a request that is in a decidable state (exists, pending, not self-approved). */
  private async loadDecidableRequest(
    requestId: string,
    approver: string,
  ): Promise<ExternalCollaboratorRequest> {
    const req = await this.requests.findOne({ where: { id: requestId } });
    if (!req) {
      throw new NotFoundException(`external-collaborator request ${requestId} not found`);
    }
    if (req.status !== 'pending') {
      throw new ConflictException(`request is already ${req.status} and cannot be decided again`);
    }
    if (approver === req.requesterId) {
      throw new ForbiddenException('no self-approval: the requester cannot approve their own request');
    }
    return req;
  }

  /** The undecided approval legs this approver is assigned to (throws if none). */
  private resolveApproverLegs(req: ExternalCollaboratorRequest, approver: string): EcLeg[] {
    const legs: EcLeg[] = [];
    if (approver === req.securityApprover && !req.securityDecision) legs.push('security');
    if (approver === req.sponsorApprover && !req.sponsorDecision) legs.push('sponsor');
    if (legs.length === 0) {
      throw new ForbiddenException(
        'you are not an assigned approver for this request, or your leg is already decided',
      );
    }
    return legs;
  }

  /** Record the decision on each leg + its audit entry. */
  private async applyLegDecisions(
    req: ExternalCollaboratorRequest,
    legs: EcLeg[],
    entry: EcApprovalDecision,
    ctx: { actor: string; approver: string; decision: 'approved' | 'denied'; comment: string | undefined },
  ): Promise<void> {
    for (const leg of legs) {
      if (leg === 'security') req.securityDecision = entry;
      else req.sponsorDecision = entry;
      await this.audit.record({ actor: ctx.actor, action: `external_collaborator.${leg}_${ctx.decision}`, entityType: 'external_collaborator_request', entityId: req.id, detail: { approver: ctx.approver, leg, decision: ctx.decision, comment: ctx.comment ?? null } });
    }
  }

  findById(id: string): Promise<ExternalCollaboratorRequest | null> {
    return this.requests.findOne({ where: { id } });
  }

  list(): Promise<ExternalCollaboratorRequest[]> {
    return this.requests.find({ order: { createdAt: 'DESC' } });
  }
}
