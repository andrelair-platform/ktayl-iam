import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { Role } from '../catalog/entities/role.entity.js';
import {
  Request as AccessRequest,
  type ApprovalDecision,
} from '../catalog/entities/request.entity.js';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { AuditService } from '../catalog/audit.service.js';
import { ManagerResolverService } from '../directory/manager-resolver.service.js';
import { SyncService } from '../sync/sync.service.js';
import { resolveApprovers } from './approver-resolution.js';

export type Leg = 'manager' | 'owner';

/**
 * The dual-approval workflow (S004, the core control — ADR-007). A request for a role is gated by
 * TWO distinct approvers — the requester's manager (from HR) and the role owner — with no
 * self-approval (four-eyes, T1). Both must approve before anything is granted; either denial
 * rejects it. On both-approved it creates an `active` Assignment (pending-sync) and hands it to the
 * Authentik sync engine (S005); **nothing reaches Authentik before both approvals** (AC-5).
 */
@Injectable()
export class WorkflowService {
  private readonly log = new Logger(WorkflowService.name);
  private readonly backupApprover: string;

  constructor(
    @InjectRepository(AccessRequest)
    private readonly requests: Repository<AccessRequest>,
    @InjectRepository(Assignment)
    private readonly assignments: Repository<Assignment>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    private readonly managerResolver: ManagerResolverService,
    private readonly audit: AuditService,
    private readonly sync: SyncService,
    config: ConfigService,
  ) {
    this.backupApprover = config.get<AppConfig['directory']>('directory')!.fallbackApprover;
  }

  /**
   * File a request for a role. Resolves + freezes the two approvers (manager from HR, owner from
   * the role), applying the no-self-approval / four-eyes reassignment. Audited; nothing is granted.
   */
  async createRequest(requesterId: string, roleId: string, actor: string): Promise<AccessRequest> {
    const role = await this.roles.findOne({ where: { id: roleId }, relations: { application: true } });
    if (!role) throw new NotFoundException(`role ${roleId} not found`);

    const mgr = await this.managerResolver.resolveManager(requesterId);
    const resolution = resolveApprovers({
      requesterId,
      managerFromHr: mgr.manager,
      roleOwner: role.owner,
      backup: this.backupApprover,
    });

    const req = await this.requests.save(
      this.requests.create({
        requesterId,
        roleId,
        status: 'pending',
        managerApprover: resolution.managerApprover,
        ownerApprover: resolution.ownerApprover,
        managerDecision: null,
        ownerDecision: null,
      }),
    );

    await this.audit.record(actor, 'request.created', 'request', req.id, {
      requester: requesterId,
      application: role.application.name,
      role: role.name,
      managerApprover: resolution.managerApprover,
      ownerApprover: resolution.ownerApprover,
      managerSource: mgr.source,
      managerFallback: mgr.fallback,
      reassignments: resolution.notes,
      needsManualReview: resolution.needsManualReview,
    });
    return req;
  }

  /**
   * Record an approver's decision on their leg(s). Enforces: request still pending; no
   * self-approval; the approver actually owns an un-decided leg. Either denial rejects the whole
   * request; both approvals → `approved` + an `active` (pending-sync) Assignment handed to S005.
   */
  async decide(
    requestId: string,
    approver: string,
    decision: 'approved' | 'denied',
    comment: string | undefined,
    actor: string,
  ): Promise<AccessRequest> {
    const req = await this.requests.findOne({
      where: { id: requestId },
      relations: { role: { application: true } },
    });
    if (!req) throw new NotFoundException(`request ${requestId} not found`);
    if (req.status !== 'pending') {
      throw new ConflictException(`request is already ${req.status} and cannot be decided again`);
    }
    // AC-4 (defence-in-depth beyond the at-creation reassignment): never self-approve.
    if (approver === req.requesterId) {
      throw new ForbiddenException('no self-approval: the requester cannot approve their own request');
    }

    const legs: Leg[] = [];
    if (approver === req.managerApprover && !req.managerDecision) legs.push('manager');
    if (approver === req.ownerApprover && !req.ownerDecision) legs.push('owner');
    if (legs.length === 0) {
      throw new ForbiddenException(
        'you are not an assigned approver for this request, or your leg is already decided',
      );
    }

    const entry: ApprovalDecision = {
      approver,
      decision,
      at: new Date().toISOString(),
      ...(comment ? { comment } : {}),
    };
    for (const leg of legs) {
      if (leg === 'manager') req.managerDecision = entry;
      else req.ownerDecision = entry;
      await this.audit.record(actor, `request.${leg}_${decision}`, 'request', req.id, {
        approver,
        leg,
        decision,
        comment: comment ?? null,
      });
    }

    // AC-2: either denial rejects the whole request; nothing is provisioned.
    if (decision === 'denied') {
      req.status = 'denied';
      await this.requests.save(req);
      await this.audit.record(actor, 'request.denied', 'request', req.id, { by: approver, legs });
      return req;
    }

    const bothApproved =
      req.managerDecision?.decision === 'approved' && req.ownerDecision?.decision === 'approved';
    if (!bothApproved) {
      // one leg approved; still pending the other (AC-1 order-independent, AC-5 nothing provisioned).
      await this.requests.save(req);
      return req;
    }

    // Both approved → grant. Create/activate the Assignment (pending-sync) and hand to S005.
    req.status = 'approved';
    await this.requests.save(req);
    const assignment = await this.grant(req.requesterId, req.roleId, 'workflow:both-approved');
    await this.audit.record(actor, 'request.approved', 'request', req.id, {
      requester: req.requesterId,
      assignmentId: assignment.id,
    });
    // AC-5: provisioning to Authentik happens ONLY now, via S005. A failed sync does not lose the
    // assignment (it stays active/pending-sync); the reconcile job heals it (AVL-3).
    await this.sync.provision(assignment).catch((e) => {
      this.log.warn(`provision of assignment ${assignment.id} failed (will reconcile): ${e}`);
    });
    return req;
  }

  /** Idempotently create (or re-activate) the active Assignment for a user+role. */
  private async grant(userId: string, roleId: string, grantedBy: string): Promise<Assignment> {
    const existing = await this.assignments.findOne({ where: { userId, roleId } });
    if (existing) {
      existing.status = 'active';
      existing.grantedBy = grantedBy;
      existing.revokedBy = null;
      existing.revokedAt = null;
      existing.syncedAt = null;
      return this.assignments.save(existing);
    }
    return this.assignments.save(
      this.assignments.create({ userId, roleId, status: 'active', grantedBy, syncedAt: null }),
    );
  }

  listRequests(filter?: { approver?: string; requester?: string; status?: string }): Promise<AccessRequest[]> {
    const where: Record<string, unknown> = {};
    if (filter?.requester) where.requesterId = filter.requester;
    if (filter?.status) where.status = filter.status;
    // approver filter is applied in-memory (it spans two columns).
    return this.requests
      .find({ where, relations: { role: { application: true } }, order: { createdAt: 'DESC' } })
      .then((rows) =>
        filter?.approver
          ? rows.filter(
              (r) => r.managerApprover === filter.approver || r.ownerApprover === filter.approver,
            )
          : rows,
      );
  }

  /**
   * S009: the requests a given user may see without admin — the ones they RAISED plus the ones
   * awaiting THEIR decision (they're an assigned manager/owner leg). Never the whole queue.
   */
  async listForUser(matricule: string): Promise<AccessRequest[]> {
    const rows = await this.requests.find({
      relations: { role: { application: true } },
      order: { createdAt: 'DESC' },
    });
    return rows.filter(
      (r) =>
        r.requesterId === matricule ||
        r.managerApprover === matricule ||
        r.ownerApprover === matricule,
    );
  }

  async getRequest(id: string): Promise<AccessRequest> {
    const req = await this.requests.findOne({
      where: { id },
      relations: { role: { application: true } },
    });
    if (!req) throw new NotFoundException(`request ${id} not found`);
    return req;
  }

  /** Revoke an active assignment (removes the Authentik membership via S005). */
  async revoke(assignmentId: string, actor: string): Promise<Assignment> {
    const a = await this.assignments.findOne({ where: { id: assignmentId }, relations: { role: true } });
    if (!a) throw new NotFoundException(`assignment ${assignmentId} not found`);
    if (a.status === 'revoked') throw new BadRequestException('assignment is already revoked');
    a.status = 'revoked';
    a.revokedBy = actor;
    a.revokedAt = new Date();
    await this.assignments.save(a);
    await this.audit.record(actor, 'assignment.revoked', 'assignment', a.id, {
      user: a.userId,
      roleId: a.roleId,
    });
    await this.sync.revoke(a).catch((e) => {
      this.log.warn(`revoke of assignment ${a.id} failed (will reconcile): ${e}`);
    });
    return a;
  }
}
