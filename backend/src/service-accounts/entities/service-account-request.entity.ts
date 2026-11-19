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
import { ServiceAccount } from './service-account.entity.js';

export type ServiceAccountRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

/** One approval leg (Security or owner) recorded on a service-account request. */
export interface SaApprovalDecision {
  approver: string; // matricule
  decision: 'approved' | 'denied';
  at: string; // ISO timestamp
  comment?: string;
}

/**
 * A request to create a governed **service account** (IGA-06 / S022). Gated by the SAME four-eyes
 * dual-approval as a human role request, but with service-account-shaped legs: a **Security/Platform
 * approver** (leg 1, replacing the HR manager — a service account has no manager) and the **owner**
 * (leg 2). A mandatory `justification` is the audit reason. Approvers are frozen at request time so
 * the decision is deterministic (the four-eyes reassignment is applied once, in the service).
 */
@Entity('service_account_request')
export class ServiceAccountRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'requester_id', type: 'varchar', length: 32 })
  requesterId!: string;

  @ManyToOne(() => ServiceAccount, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'service_account_id' })
  serviceAccount!: Relation<ServiceAccount>;

  @Column({ name: 'service_account_id', type: 'uuid' })
  serviceAccountId!: string;

  /** Why this privileged non-human identity is needed — a mandatory audit reason (AC-1). */
  @Column({ type: 'text' })
  justification!: string;

  /** Leg 1 — the Security/Platform approver (replaces the HR-manager leg), frozen at request time. */
  @Column({ name: 'security_approver', type: 'varchar', length: 32, nullable: true })
  securityApprover!: string | null;

  /** Leg 2 — the service-account owner. */
  @Column({ name: 'owner_approver', type: 'varchar', length: 32, nullable: true })
  ownerApprover!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: ServiceAccountRequestStatus;

  @Column({ name: 'security_decision', type: 'jsonb', nullable: true })
  securityDecision!: SaApprovalDecision | null;

  @Column({ name: 'owner_decision', type: 'jsonb', nullable: true })
  ownerDecision!: SaApprovalDecision | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
