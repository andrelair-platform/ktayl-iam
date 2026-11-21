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
import { resolveApprovers } from '../workflow/approver-resolution.js';
import {
  ServiceAccountRequest,
  type SaApprovalDecision,
} from './entities/service-account-request.entity.js';
import {
  ServiceAccountService,
  type CreateServiceAccountInput,
} from './service-account.service.js';
import { ServiceAccountProvisioningService } from './service-account-provisioning.service.js';

export type SaLeg = 'security' | 'owner';

export interface FileServiceAccountRequestInput extends Omit<CreateServiceAccountInput, 'createdBy'> {
  justification: string;
}

/**
 * The governed service-account request + dual-approval (IGA-06 / S022). Reuses the human workflow's
 * pure four-eyes resolver (`resolveApprovers`) — mapping the "manager" leg to a **Security/Platform
 * approver** (a service account has no HR manager) and the "owner" leg to the service-account owner.
 * A mandatory justification is required. Nothing reaches Authentik here — both approvals leave the
 * request `approved` (the owned service account stays `requested`) and S023 provisions it.
 */
@Injectable()
export class ServiceAccountWorkflowService {
  private readonly log = new Logger(ServiceAccountWorkflowService.name);
  private readonly securityApprover: string;
  private readonly backupApprover: string;

  // eslint-disable-next-line max-params -- NestJS DI constructor (injected dependencies, cannot be an options object)
  constructor(
    @InjectRepository(ServiceAccountRequest)
    private readonly requests: Repository<ServiceAccountRequest>,
    private readonly accounts: ServiceAccountService,
    private readonly audit: AuditService,
    config: ConfigService,
    /**
     * S023 provisioning. @Optional so the S022 unit tests (and any wiring before S023) construct the
     * workflow without it — when absent, an approval simply logs "awaiting provisioning".
     */
    @Optional()
    private readonly provisioning?: ServiceAccountProvisioningService,
  ) {
    const dir = config.get<AppConfig['directory']>('directory')!;
    this.securityApprover = dir.securityApprover;
    this.backupApprover = dir.fallbackApprover;
  }

  /** File a service-account request: create the account (`requested`) + resolve the four-eyes legs. */
  async fileRequest(input: FileServiceAccountRequestInput, actor: string): Promise<ServiceAccountRequest> {
    if (!input.justification || !input.justification.trim()) {
      throw new UnprocessableEntityException('a service-account request requires a justification');
    }

    const account = await this.accounts.create({ ...input, createdBy: actor });

    // Reuse the pure four-eyes resolver: "manager" leg → Security approver, "owner" leg → the owner.
    const resolution = resolveApprovers({
      requesterId: actor,
      managerFromHr: this.securityApprover,
      roleOwner: input.ownerMatricule,
      backup: this.backupApprover,
    });

    const req = await this.requests.save(
      this.requests.create({
        requesterId: actor,
        serviceAccountId: account.id,
        justification: input.justification.trim(),
        securityApprover: resolution.managerApprover,
        ownerApprover: resolution.ownerApprover,
        status: 'pending',
        securityDecision: null,
        ownerDecision: null,
      }),
    );

    await this.audit.record({ actor: actor, action: 'service_account.requested', entityType: 'service_account_request', entityId: req.id, detail: {
      serviceAccount: account.name,
      owner: input.ownerMatricule,
      groups: input.groupRefs,
      securityApprover: resolution.managerApprover,
      ownerApprover: resolution.ownerApprover,
      justification: req.justification,
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
  }): Promise<ServiceAccountRequest> {
    const { requestId, approver, decision, comment, actor } = opts;
    const req = await this.loadDecidableRequest(requestId, approver);
    const legs = this.resolveApproverLegs(req, approver);

    const entry: SaApprovalDecision = {
      approver,
      decision,
      at: new Date().toISOString(),
      ...(comment ? { comment } : {}),
    };
    await this.applyLegDecisions(req, legs, entry, { actor, approver, decision, comment });

    if (decision === 'denied') {
      req.status = 'denied';
      await this.requests.save(req);
      await this.audit.record({ actor: actor, action: 'service_account.denied', entityType: 'service_account_request', entityId: req.id, detail: {
        by: approver,
        legs,
      } });
      return req;
    }

    const bothApproved =
      req.securityDecision?.decision === 'approved' && req.ownerDecision?.decision === 'approved';
    if (!bothApproved) {
      await this.requests.save(req); // one leg in; still pending the other
      return req;
    }

    req.status = 'approved';
    await this.requests.save(req);
    await this.audit.record({ actor: actor, action: 'service_account.approved', entityType: 'service_account_request', entityId: req.id, detail: {
      serviceAccountId: req.serviceAccountId,
    } });

    // S023 — best-effort provision to Authentik + Vault now the four-eyes gate has cleared. A failure
    // is retryable (POST /service-accounts/:id/provision) and is itself audited; it does NOT un-approve
    // the governance decision, so we never roll the request back on a downstream (network) error.
    if (this.provisioning) {
      try {
        await this.provisioning.provision(req.serviceAccountId, actor);
      } catch (err) {
        this.log.warn(
          `auto-provisioning of ${req.serviceAccountId} failed (retryable): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      this.log.log(`service-account request ${req.id} approved — awaiting provisioning (S023)`);
    }
    return req;
  }

  /** Load a request that is in a decidable state (exists, pending, not self-approved). */
  private async loadDecidableRequest(
    requestId: string,
    approver: string,
  ): Promise<ServiceAccountRequest> {
    const req = await this.requests.findOne({ where: { id: requestId } });
    if (!req) {
      throw new NotFoundException(`service-account request ${requestId} not found`);
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
  private resolveApproverLegs(req: ServiceAccountRequest, approver: string): SaLeg[] {
    const legs: SaLeg[] = [];
    if (approver === req.securityApprover && !req.securityDecision) legs.push('security');
    if (approver === req.ownerApprover && !req.ownerDecision) legs.push('owner');
    if (legs.length === 0) {
      throw new ForbiddenException(
        'you are not an assigned approver for this request, or your leg is already decided',
      );
    }
    return legs;
  }

  /** Record the decision on each leg + its audit entry. */
  private async applyLegDecisions(
    req: ServiceAccountRequest,
    legs: SaLeg[],
    entry: SaApprovalDecision,
    ctx: { actor: string; approver: string; decision: 'approved' | 'denied'; comment: string | undefined },
  ): Promise<void> {
    for (const leg of legs) {
      if (leg === 'security') req.securityDecision = entry;
      else req.ownerDecision = entry;
      await this.audit.record({ actor: ctx.actor, action: `service_account.${leg}_${ctx.decision}`, entityType: 'service_account_request', entityId: req.id, detail: {
        approver: ctx.approver,
        leg,
        decision: ctx.decision,
        comment: ctx.comment ?? null,
      } });
    }
  }

  findById(id: string): Promise<ServiceAccountRequest | null> {
    return this.requests.findOne({ where: { id } });
  }

  list(): Promise<ServiceAccountRequest[]> {
    return this.requests.find({ order: { createdAt: 'DESC' } });
  }
}
