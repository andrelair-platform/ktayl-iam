import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A person onboarded into the IAM platform from an HR Joiner event (S015/S016). Keyed by the HR
 * **matricule** (= the Authentik username everywhere else in this service), this record makes the
 * employee a first-class, selectable SUBJECT of the access-request → dual-approval → provision flow
 * (an access request targets a matricule; before this, matricules were only resolved live against
 * Authentik/HR). ERPNext stays the HR system of record; this is IAM's own identity mirror.
 */
@Entity('identity')
export class Identity {
  /** HR matricule — the stable key (same value used as Authentik username + assignment.user_id). */
  @PrimaryColumn({ type: 'varchar', length: 32 })
  matricule!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 160 })
  fullName!: string;

  /** The provisioned workplace mailbox (firstname.lastname@devandre.sbs), null until provisioned. */
  @Index('uq_identity_email', { unique: true })
  @Column({ type: 'varchar', length: 190, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  department!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  entity!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  job!: string | null;

  /** Lifecycle status mirrored from HR: active (joiner/mover) | left (leaver). */
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string;

  /** true once the Authentik user exists + is in the birthright group (idempotency guard). */
  @Column({ name: 'authentik_provisioned', type: 'boolean', default: false })
  authentikProvisioned!: boolean;

  /** true once the Stalwart mailbox exists (idempotency guard). */
  @Column({ name: 'mailbox_provisioned', type: 'boolean', default: false })
  mailboxProvisioned!: boolean;

  /**
   * MVP: the generated initial mailbox password, for the admin/welcome flow to hand to the new
   * employee (who then changes it). Cleared once delivered. A proper welcome-email + forced-reset
   * (or a self-service set-password) is the follow-up — tracked, not built here.
   */
  @Column({ name: 'initial_mailbox_password', type: 'varchar', length: 64, nullable: true })
  initialMailboxPassword!: string | null;

  /** The source event's occurred_at of the last applied lifecycle event (ordering/idempotency). */
  @Column({ name: 'last_event_at', type: 'timestamptz', nullable: true })
  lastEventAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
