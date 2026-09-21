import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity.js';

/** Writes the append-only audit trail. Every governance mutation records one row. */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async record(
    actor: string,
    action: string,
    entityType: string,
    entityId: string,
    detail: Record<string, unknown> = {},
  ): Promise<void> {
    await this.repo.save(this.repo.create({ actor, action, entityType, entityId, detail }));
  }
}
