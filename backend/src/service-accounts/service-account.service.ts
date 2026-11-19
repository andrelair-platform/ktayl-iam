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
    await this.audit.record(input.createdBy, 'service_account.created', 'service_account', sa.id, {
      name: sa.name,
      type: sa.type,
      owner: sa.ownerMatricule,
      groups: sa.groupRefs,
    });
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

  /** Flip lifecycle status (driven by S022/S023) + audit the transition. */
  async updateStatus(id: string, status: ServiceAccountStatus, actor: string): Promise<ServiceAccount> {
    const sa = await this.getById(id);
    sa.status = status;
    const saved = await this.repo.save(sa);
    await this.audit.record(actor, `service_account.${status}`, 'service_account', id, {});
    return saved;
  }
}
