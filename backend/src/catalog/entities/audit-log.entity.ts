import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only audit trail — every governance mutation writes one row (who did what, to which
 * entity, with what payload). This is the evidence backbone for the who-has-what view (S006)
 * and the DORA/ISO access-governance controls (never updated or deleted).
 */
@Entity('audit_log')
@Index('ix_audit_entity', ['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** matricule of the actor, or 'system' for automated actions (sync/reconcile). */
  @Column({ type: 'varchar', length: 32 })
  actor!: string;

  /** dotted action name, e.g. `application.created`, `role.created`. */
  @Column({ type: 'varchar', length: 60 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 40 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 64 })
  entityId!: string;

  @Column({ type: 'jsonb', default: {} })
  detail!: Record<string, unknown>;

  @Column({ name: 'at', type: 'timestamptz', default: () => 'now()' })
  at!: Date;
}
