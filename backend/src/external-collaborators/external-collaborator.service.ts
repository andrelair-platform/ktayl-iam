import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExternalCollaborator,
  type ExternalCollaboratorStatus,
  type ExternalCollaboratorType,
} from './entities/external-collaborator.entity.js';
import { AuditService } from '../catalog/audit.service.js';
import { EXPIRY_CEILING_DAYS, EXPIRY_DEFAULT_DAYS } from './constants.js';

export interface CreateExternalCollaboratorInput {
  name: string;
  displayName: string;
  email: string;
  type: ExternalCollaboratorType;
  /** The contractor firm; null/omitted = freelance. */
  company?: string | null;
  /** Pay-link (ADR-010): read-only ERPNext Supplier / procurement contract ref a paid contractor is paid against. */
  supplierRef?: string | null;
  sponsorMatricule: string;
  purpose: string;
  groupRefs: string[];
  expiresAt?: Date | null;
  createdBy: string;
}

/**
 * Persistence for the governed external-collaborator entity (IGA-07 / S025). No lifecycle rules live here —
 * the dual-approval workflow (S026), Authentik provisioning (S027), expiry/renewal (S028) and the
 * sponsor-Leaver safety net (S029) drive the transitions; this only creates/finds/lists and flips status,
 * auditing each write. A created collaborator starts `requested`.
 */
@Injectable()
export class ExternalCollaboratorService {
  constructor(
    @InjectRepository(ExternalCollaborator)
    private readonly repo: Repository<ExternalCollaborator>,
    private readonly audit: AuditService,
  ) {}

  /** Create a collaborator in `requested` status (unique name) + audit it. */
  async create(input: CreateExternalCollaboratorInput): Promise<ExternalCollaborator> {
    if (await this.repo.findOne({ where: { name: input.name } })) {
      throw new ConflictException(`external collaborator '${input.name}' already exists`);
    }
    const c = await this.repo.save(
      this.repo.create({
        name: input.name,
        displayName: input.displayName,
        email: input.email,
        type: input.type,
        company: input.company?.trim() || null,
        supplierRef: input.supplierRef?.trim() || null,
        sponsorMatricule: input.sponsorMatricule,
        purpose: input.purpose,
        groupRefs: input.groupRefs,
        expiresAt: input.expiresAt ?? null,
        createdBy: input.createdBy,
        status: 'requested',
      }),
    );
    await this.audit.record(
      input.createdBy,
      'external_collaborator.created',
      'external_collaborator',
      c.id,
      {
        name: c.name,
        type: c.type,
        company: c.company ?? 'freelance',
        supplierRef: c.supplierRef ?? null,
        sponsor: c.sponsorMatricule,
        groups: c.groupRefs,
        expiresAt: c.expiresAt?.toISOString() ?? null,
      },
    );
    return c;
  }

  findById(id: string): Promise<ExternalCollaborator | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getById(id: string): Promise<ExternalCollaborator> {
    const c = await this.findById(id);
    if (!c) {
      throw new NotFoundException(`external collaborator ${id} not found`);
    }
    return c;
  }

  findByName(name: string): Promise<ExternalCollaborator | null> {
    return this.repo.findOne({ where: { name } });
  }

  list(): Promise<ExternalCollaborator[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Mark a collaborator provisioned (S027): flip to `active` and record its Authentik username.
   * Persistence only — the provisioning service audits the richer `external_collaborator.provisioned` event.
   */
  async markProvisioned(id: string, authentikUsername: string): Promise<ExternalCollaborator> {
    const c = await this.getById(id);
    c.status = 'active';
    c.authentikUsername = authentikUsername;
    return this.repo.save(c);
  }

  /**
   * Renew an active engagement (S028): extend `expires_at` to now + `days` (capped at the hard ceiling)
   * and stamp `last_recertified_at`. Active-only (409 otherwise). Admin-gated + audited — the oversight on
   * extending external access (a full four-eyes-on-renewal is a future refinement; the admin override applies).
   */
  async renew(id: string, actor: string, days?: number): Promise<ExternalCollaborator> {
    const c = await this.getById(id);
    if (c.status !== 'active') {
      throw new ConflictException(`only an active collaborator can be renewed (is '${c.status}')`);
    }
    const d = Math.min(days ?? EXPIRY_DEFAULT_DAYS, EXPIRY_CEILING_DAYS);
    c.expiresAt = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
    c.lastRecertifiedAt = new Date();
    const saved = await this.repo.save(c);
    await this.audit.record(actor, 'external_collaborator.renewed', 'external_collaborator', id, {
      days: d,
      expiresAt: c.expiresAt.toISOString(),
    });
    return saved;
  }

  /** All currently-active collaborators (drives the sentinel sweep S028/S029). */
  listActive(): Promise<ExternalCollaborator[]> {
    return this.repo.find({ where: { status: 'active' }, order: { createdAt: 'DESC' } });
  }

  /** Active collaborators whose expiry falls within `withinDays` (incl. already past) — the renewal worklist. */
  async listDueForRenewal(withinDays: number): Promise<ExternalCollaborator[]> {
    const threshold = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const active = await this.listActive();
    return active.filter((c) => c.expiresAt !== null && c.expiresAt <= threshold);
  }

  /** Flip lifecycle status (driven by S026–S029) + audit the transition. */
  async updateStatus(
    id: string,
    status: ExternalCollaboratorStatus,
    actor: string,
  ): Promise<ExternalCollaborator> {
    const c = await this.getById(id);
    c.status = status;
    const saved = await this.repo.save(c);
    await this.audit.record(
      actor,
      `external_collaborator.${status}`,
      'external_collaborator',
      id,
      {},
    );
    return saved;
  }
}
