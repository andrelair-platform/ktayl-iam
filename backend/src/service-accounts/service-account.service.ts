import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ServiceAccount,
  type ServiceAccountStatus,
  type ServiceAccountType,
} from './entities/service-account.entity.js';
import { AuditService } from '../catalog/audit.service.js';

export interface CreateServiceAccountInput {
  name: string;
  displayName: string;
  type: ServiceAccountType;
  ownerMatricule: string;
  groupRefs: string[];
  createdBy: string;
}

/**
 * Persistence for the governed service-account entity (IGA-06 / S021). No lifecycle rules live here — the
 * dual-approval workflow (S022) and the Authentik/Vault provisioning (S023) drive the transitions; this
 * only creates/finds/lists and flips status, auditing each write. A created account starts `requested`.
 */
@Injectable()
export class ServiceAccountService {
  constructor(
    @InjectRepository(ServiceAccount)
    private readonly repo: Repository<ServiceAccount>,
    private readonly audit: AuditService,
  ) {}

  /** Create a service account in `requested` status (unique name) + audit it. */
  async create(input: CreateServiceAccountInput): Promise<ServiceAccount> {
    if (await this.repo.findOne({ where: { name: input.name } })) {
      throw new ConflictException(`service account '${input.name}' already exists`);
    }
    const sa = await this.repo.save(
      this.repo.create({
        name: input.name,
        displayName: input.displayName,
        type: input.type,
        ownerMatricule: input.ownerMatricule,
        groupRefs: input.groupRefs,
        createdBy: input.createdBy,
        status: 'requested',
      }),
    );
    await this.audit.record({ actor: input.createdBy, action: 'service_account.created', entityType: 'service_account', entityId: sa.id, detail: {
      name: sa.name,
      type: sa.type,
      owner: sa.ownerMatricule,
      groups: sa.groupRefs,
    } });
    return sa;
  }

  findById(id: string): Promise<ServiceAccount | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getById(id: string): Promise<ServiceAccount> {
    const sa = await this.findById(id);
    if (!sa) {
      throw new NotFoundException(`service account ${id} not found`);
    }
    return sa;
  }

  findByName(name: string): Promise<ServiceAccount | null> {
    return this.repo.findOne({ where: { name } });
  }

  list(): Promise<ServiceAccount[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Mark an account provisioned (S023): flip to `active` and record its Authentik username + the
   * Vault secret ref — NEVER the secret value. Persistence only; the provisioning service audits the
   * richer `service_account.provisioned` event.
   */
  async markProvisioned(
    id: string,
    authentikUsername: string,
    vaultSecretRef: string,
  ): Promise<ServiceAccount> {
    const sa = await this.getById(id);
    sa.status = 'active';
    sa.authentikUsername = authentikUsername;
    sa.vaultSecretRef = vaultSecretRef;
    return this.repo.save(sa);
  }

  /**
   * Owner/admin re-attestation that an ACTIVE account is still needed (S024 recertification). Stamps
   * `last_recertified_at` + audits it — the periodic access-recert campaign's write. Active-only (a
   * requested/disabled account isn't a live grant to re-attest → 409).
   */
  async recertify(id: string, actor: string): Promise<ServiceAccount> {
    const sa = await this.getById(id);
    if (sa.status !== 'active') {
      throw new ConflictException(
        `only an active service account can be recertified (is '${sa.status}')`,
      );
    }
    sa.lastRecertifiedAt = new Date();
    const saved = await this.repo.save(sa);
    await this.audit.record({ actor: actor, action: 'service_account.recertified', entityType: 'service_account', entityId: id, detail: {
      name: sa.name,
      owner: sa.ownerMatricule,
      at: sa.lastRecertifiedAt.toISOString(),
    } });
    return saved;
  }

  /**
   * Active accounts DUE for recertification (S024): never recertified, or last recertified more than
   * `maxAgeDays` ago. Drives the owner's periodic re-attestation — a stale privileged non-human
   * identity that nobody re-attests is exactly what an access-recert campaign must surface.
   */
  async listDueForRecertification(maxAgeDays: number): Promise<ServiceAccount[]> {
    const threshold = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    const active = await this.repo.find({ where: { status: 'active' }, order: { createdAt: 'DESC' } });
    return active.filter((sa) => sa.lastRecertifiedAt === null || sa.lastRecertifiedAt < threshold);
  }

  /** Flip lifecycle status (driven by S022/S023) + audit the transition. */
  async updateStatus(id: string, status: ServiceAccountStatus, actor: string): Promise<ServiceAccount> {
    const sa = await this.getById(id);
    sa.status = status;
    const saved = await this.repo.save(sa);
    await this.audit.record({ actor: actor, action: `service_account.${status}`, entityType: 'service_account', entityId: id, detail: {} });
    return saved;
  }
}
