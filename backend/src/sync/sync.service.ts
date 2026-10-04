import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { Role } from '../catalog/entities/role.entity.js';
import { AuditService } from '../catalog/audit.service.js';
import { AuthentikClient } from '../directory/authentik.client.js';
import { computeDrift } from './reconcile-diff.js';

export interface ReconcileReport {
  ran: boolean;
  driftCount: number;
  applied: number;
  changes: { group: string; user: string; op: 'add' | 'remove'; reason: string; ok: boolean }[];
  skippedReason?: string;
  at: string;
}

/**
 * The Authentik sync engine (S005). Turns an approved assignment into a real group membership so
 * login actually enforces the role (AC-1), idempotently (AC-2), removes it on revoke (AC-3), and
 * runs a scheduled reconcile that heals hand-edits + alerts on drift (AC-4). A failed sync never
 * loses the grant — the assignment stays active/pending-sync and the reconcile re-applies it (AVL-3).
 */
@Injectable()
export class SyncService {
  private readonly log = new Logger(SyncService.name);
  private lastReconcile: ReconcileReport | null = null;
  private readonly exclusiveGroups: Set<string>;

  constructor(
    @InjectRepository(Assignment)
    private readonly assignments: Repository<Assignment>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    private readonly ak: AuthentikClient,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.exclusiveGroups = new Set(config.get<AppConfig['sync']>('sync')!.exclusiveGroups);
  }

  /** AC-1/AC-2: enforce an active assignment as a group membership (idempotent). */
  async provision(assignment: Assignment): Promise<void> {
    const role = assignment.role ?? (await this.roles.findOneByOrFail({ id: assignment.roleId }));
    if (!this.ak.configured) {
      await this.markPending(assignment, 'Authentik API not configured — left pending for reconcile');
      return;
    }
    try {
      await this.ak.addUserToGroup(assignment.userId, role.authentikGroupRef);
      await this.markSynced(assignment);
      await this.audit.record('system', 'assignment.synced', 'assignment', assignment.id, {
        user: assignment.userId,
        group: role.authentikGroupRef,
      });
    } catch (e) {
      await this.markPending(assignment, String(e));
      await this.audit.record('system', 'assignment.sync_failed', 'assignment', assignment.id, {
        user: assignment.userId,
        group: role.authentikGroupRef,
        error: String(e),
      });
      throw e;
    }
  }

  /** AC-3: remove the membership for a revoked assignment (idempotent). */
  async revoke(assignment: Assignment): Promise<void> {
    const role = assignment.role ?? (await this.roles.findOneByOrFail({ id: assignment.roleId }));
    if (!this.ak.configured) return;
    await this.ak.removeUserFromGroup(assignment.userId, role.authentikGroupRef);
    await this.audit.record('system', 'assignment.unsynced', 'assignment', assignment.id, {
      user: assignment.userId,
      group: role.authentikGroupRef,
    });
  }

  private async markSynced(a: Assignment): Promise<void> {
    a.syncedAt = new Date();
    a.lastSyncError = null;
    await this.assignments.save(a);
  }
  private async markPending(a: Assignment, err: string): Promise<void> {
    a.syncedAt = null;
    a.lastSyncError = err.slice(0, 1000);
    await this.assignments.save(a);
  }

  /** AC-4: scheduled reconcile — hourly. (Also callable on demand by an admin.) */
  @Cron(CronExpression.EVERY_HOUR, { name: 'iam-reconcile' })
  async scheduledReconcile(): Promise<void> {
    const report = await this.reconcile();
    if (report.driftCount > 0) {
      this.log.warn(`reconcile healed ${report.applied}/${report.driftCount} drifted memberships`);
    }
  }

  lastReport(): ReconcileReport | null {
    return this.lastReconcile;
  }

  /**
   * Diff DB (active assignments, by governed group) ↔ Authentik (actual members) and heal the
   * drift. DB is authoritative: re-add dropped memberships, remove hand-added ones. Every drift is
   * audited (alerting). Governed groups = the distinct `authentikGroupRef`s in the catalog, so we
   * never touch groups the platform doesn't manage.
   */
  async reconcile(): Promise<ReconcileReport> {
    const at = new Date().toISOString();
    if (!this.ak.configured) {
      this.lastReconcile = { ran: false, driftCount: 0, applied: 0, changes: [], skippedReason: 'Authentik API not configured', at };
      return this.lastReconcile;
    }

    const activeAssignments = await this.assignments.find({
      where: { status: 'active' },
      relations: { role: true },
    });
    // desired: group → set of users with an active assignment mapping to it.
    const desired = new Map<string, Set<string>>();
    const governedGroups = new Set<string>();
    for (const a of activeAssignments) {
      const group = a.role.authentikGroupRef;
      governedGroups.add(group);
      (desired.get(group) ?? desired.set(group, new Set()).get(group)!).add(a.userId);
    }
    // also govern groups that have roles but currently no active members (so hand-adds are caught).
    for (const r of await this.roles.find()) governedGroups.add(r.authentikGroupRef);

    const actual = new Map<string, Set<string>>();
    for (const group of governedGroups) {
      const members = await this.ak.groupMemberUsernames(group);
      actual.set(group, new Set(members));
    }

    const drift = computeDrift(desired, actual);
    const changes: ReconcileReport['changes'] = [];
    let applied = 0;
    for (const c of drift) {
      // SAFETY: 're-add missing' always heals (the DB granted it). 'remove extraneous' only acts on
      // groups the platform EXCLUSIVELY owns — otherwise we'd risk nuking a hand-managed group's
      // membership (e.g. Platform Admins). Non-exclusive removes are ALERTED, not applied.
      const act = c.op === 'add' || this.exclusiveGroups.has(c.group);
      let ok = true;
      if (act) {
        try {
          if (c.op === 'add') await this.ak.addUserToGroup(c.user, c.group);
          else await this.ak.removeUserFromGroup(c.user, c.group);
          applied++;
        } catch (e) {
          ok = false;
          this.log.warn(`reconcile ${c.op} ${c.user}@${c.group} failed: ${e}`);
        }
      }
      changes.push({ ...c, ok: act ? ok : true });
      await this.audit.record('system', act ? 'sync.drift_healed' : 'sync.drift_detected', 'group', c.group, {
        user: c.user,
        op: c.op,
        reason: c.reason,
        acted: act,
        note: act ? undefined : 'extraneous membership on a non-exclusive group — alert only, not removed',
        ok,
      });
    }

    this.lastReconcile = { ran: true, driftCount: drift.length, applied, changes, at };
    return this.lastReconcile;
  }
}
