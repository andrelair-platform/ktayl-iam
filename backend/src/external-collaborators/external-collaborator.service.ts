import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExternalCollaborator,
  type ExternalCollaboratorStatus,
  type ExternalCollaboratorType,
} from './entities/external-collaborator.entity.js';
import { AuditService } from '../catalog/audit.service.js';

export interface CreateExternalCollaboratorInput {
  name: string;
  displayName: string;
  email: string;
  type: ExternalCollaboratorType;
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
