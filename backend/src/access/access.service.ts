import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { Application } from '../catalog/entities/application.entity.js';
import { AuditLog } from '../catalog/entities/audit-log.entity.js';
import { AuthentikClient } from '../directory/authentik.client.js';
import { toCsv } from './csv.js';

export interface UserAccessRow {
  application: string;
  role: string;
  authentikGroup: string;
  status: string;
  synced: boolean;
  grantedAt: string;
}
export interface AppAccessRow {
  user: string;
  role: string;
  status: string;
  synced: boolean;
  grantedAt: string;
}

/** ADR-017 — a row in a user's self-service "My Access" view, tagged by WHY they have it. */
export interface MyAccessRow {
  /** Governed = earned via four-eyes (an assignment); Birthright = the Workplace Users baseline;
   *  Direct = an Authentik group with no governed assignment (manually added / outside the catalog). */
  source: 'Governed' | 'Birthright' | 'Direct';
  application: string;
  role: string;
  authentikGroup: string;
  status: string;
  synced: boolean;
  grantedAt: string | null;
}

/**
 * The evidence layer (S006). Read-only views over the active assignments + the append-only audit
 * trail, for the auditor / access admin (DORA / ISO-27001 access-control evidence). Admin/auditor
 * access is enforced at the controller by the global guard (threat T7); audit rows are immutable at
 * the DB level (append-only rules, threat T8).
 */
@Injectable()
export class AccessService {
  private readonly workplaceGroup: string;

  // eslint-disable-next-line max-params -- NestJS DI constructor (injected dependencies, cannot be an options object)
  constructor(
    @InjectRepository(Assignment)
    private readonly assignments: Repository<Assignment>,
    @InjectRepository(Application)
    private readonly apps: Repository<Application>,
    @InjectRepository(AuditLog)
    private readonly audit: Repository<AuditLog>,
    private readonly authentik: AuthentikClient,
    config: ConfigService,
  ) {
    this.workplaceGroup = config.get<AppConfig['lifecycle']>('lifecycle')!.workplaceGroup;
  }

  /**
   * ADR-017 — the self-service "My Access" view: the COMPLETE picture of what a user can access, each row
   * tagged by source. Merges (a) **governed** grants (their active assignments, earned via four-eyes) with
   * (b) their **live Authentik group memberships** that aren't a governed grant — the `Workplace Users`
   * **birthright** + any **direct** group. Self-scoped: the caller passes their OWN matricule (enforced at
   * the controller). Read-only — no grant/revoke from here.
   */
  async forUserComplete(matricule: string): Promise<{ user: string; access: MyAccessRow[] }> {
    const governed = await this.forUser(matricule);
    const govGroups = new Set(governed.access.map((r) => r.authentikGroup));
    const rows: MyAccessRow[] = governed.access.map((r) => ({ source: 'Governed', ...r }));

    let liveGroups: string[] = [];
    try {
      if (this.authentik.configured) liveGroups = await this.authentik.getUserGroups(matricule);
    } catch {
      // best-effort: if Authentik is unreachable, still return the governed grants
    }
    for (const g of liveGroups) {
      if (govGroups.has(g)) continue; // already shown as a governed row
      rows.push({
        source: g === this.workplaceGroup ? 'Birthright' : 'Direct',
        application: g === this.workplaceGroup ? 'Workplace (birthright)' : 'Directory group',
        role: g,
        authentikGroup: g,
        status: 'member',
        synced: true,
        grantedAt: null,
      });
    }
    return { user: matricule, access: rows };
  }

  /** All app-roles a user holds (active). */
  async forUser(matricule: string): Promise<{ user: string; access: UserAccessRow[] }> {
    const rows = await this.assignments.find({
      where: { userId: matricule, status: 'active' },
      relations: { role: { application: true } },
      order: { grantedAt: 'DESC' },
    });
    return {
      user: matricule,
      access: rows.map((a) => ({
        application: a.role.application.name,
        role: a.role.name,
        authentikGroup: a.role.authentikGroupRef,
        status: a.status,
        synced: a.syncedAt != null,
        grantedAt: a.grantedAt.toISOString(),
      })),
    };
  }

  /** All users/roles for an application (active). */
  async forApplication(appId: string): Promise<{ application: string; access: AppAccessRow[] }> {
    const app = await this.apps.findOneOrFail({ where: { id: appId } });
    const rows = await this.assignments
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.role', 'r')
      .where('r.application_id = :appId', { appId })
      .andWhere('a.status = :st', { st: 'active' })
      .orderBy('a.user_id', 'ASC')
      .getMany();
    return {
      application: app.name,
      access: rows.map((a) => ({
        user: a.userId,
        role: a.role.name,
        status: a.status,
        synced: a.syncedAt != null,
        grantedAt: a.grantedAt.toISOString(),
      })),
    };
  }

  /** Full who-has-what matrix (every active assignment). */
  async matrix(): Promise<{ user: string; application: string; role: string; synced: boolean }[]> {
    const rows = await this.assignments.find({
      where: { status: 'active' },
      relations: { role: { application: true } },
      order: { userId: 'ASC' },
    });
    return rows.map((a) => ({
      user: a.userId,
      application: a.role.application.name,
      role: a.role.name,
      synced: a.syncedAt != null,
    }));
  }

  /** The audit trail (most recent first), optionally filtered by entity type. */
  listAudit(entityType?: string, limit = 500): Promise<AuditLog[]> {
    return this.audit.find({
      where: entityType ? { entityType } : {},
      order: { at: 'DESC' },
      take: Math.min(limit, 5000),
    });
  }

  /** Export the audit trail as JSON or CSV for an external auditor. */
  async exportAudit(format: 'json' | 'csv'): Promise<{ body: string; contentType: string; filename: string }> {
    const rows = await this.audit.find({ order: { at: 'ASC' } });
    if (format === 'csv') {
      const csv = toCsv(
        ['at', 'actor', 'action', 'entityType', 'entityId', 'detail'],
        rows.map((r) => ({
          at: r.at.toISOString(),
          actor: r.actor,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          detail: JSON.stringify(r.detail),
        })),
      );
      return { body: csv, contentType: 'text/csv', filename: 'iam-audit.csv' };
    }
    return { body: JSON.stringify(rows, null, 2), contentType: 'application/json', filename: 'iam-audit.json' };
  }
}
