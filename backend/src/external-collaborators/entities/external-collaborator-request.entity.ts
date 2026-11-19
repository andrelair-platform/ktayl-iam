import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { ExternalCollaborator } from './external-collaborator.entity.js';

export type EcRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

/** One approval leg (Sponsor or Security) recorded on an external-collaborator request. */
export interface EcApprovalDecision {
  approver: string; // matricule
  decision: 'approved' | 'denied';
  at: string; // ISO timestamp
  comment?: string;
}

/**
 * A request to onboard a governed **external collaborator** (IGA-07 / S026). Gated by **Sponsor +
 * Security** four-eyes: the **sponsor** (leg 1, the accountable active-employee) and a **Security/Platform
 * approver** (leg 2, the scope + expiry guardrail). Approvers are frozen at request time (the four-eyes
 * reassignment is applied once, in the service). The reason lives as `purpose` on the collaborator.
 */
@Entity('external_collaborator_request')
export class ExternalCollaboratorRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'requester_id', type: 'varchar', length: 32 })
  requesterId!: string;

  @ManyToOne(() => ExternalCollaborator, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'collaborator_id' })
  collaborator!: Relation<ExternalCollaborator>;

  @Column({ name: 'collaborator_id', type: 'uuid' })
  collaboratorId!: string;

  /** Leg 1 — the accountable **sponsor** (an active employee), frozen at request time. */
  @Column({ name: 'sponsor_approver', type: 'varchar', length: 32, nullable: true })
  sponsorApprover!: string | null;

  /** Leg 2 — the **Security/Platform approver** (scope + expiry guardrail). */
  @Column({ name: 'security_approver', type: 'varchar', length: 32, nullable: true })
  securityApprover!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: EcRequestStatus;

  @Column({ name: 'sponsor_decision', type: 'jsonb', nullable: true })
  sponsorDecision!: EcApprovalDecision | null;

  @Column({ name: 'security_decision', type: 'jsonb', nullable: true })
  securityDecision!: EcApprovalDecision | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
