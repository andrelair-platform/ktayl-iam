import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Role } from './role.entity.js';

export type AssignmentStatus = 'active' | 'revoked';

/**
 * A granted (or revoked) role for a user. Schema is introduced in S002; the provision/revoke
 * lifecycle is written by the approval workflow (S004) + the Authentik sync engine (S005), and
 * read by the who-has-what evidence view (S006).
 */
@Entity('assignment')
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The user who holds the role — matricule (= Authentik username). */
  @Column({ name: 'user_id', type: 'varchar', length: 32 })
  userId!: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: Relation<Role>;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: AssignmentStatus;

  @Column({ name: 'granted_by', type: 'varchar', length: 32, nullable: true })
  grantedBy!: string | null;

  @Column({ name: 'revoked_by', type: 'varchar', length: 32, nullable: true })
  revokedBy!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /**
   * When the Authentik sync engine (S005) last reconciled this assignment to a real group
   * membership. `null` = pending-sync (granted but not yet enforced, or needs re-sync after a
   * failure) → the reconcile job will apply it. Set to `now()` once the membership is confirmed.
   */
  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt!: Date | null;

  /** Last sync error (if any) — surfaced for drift alerting; cleared on a successful sync. */
  @Column({ name: 'last_sync_error', type: 'text', nullable: true })
  lastSyncError!: string | null;

  @CreateDateColumn({ name: 'granted_at' })
  grantedAt!: Date;
}
