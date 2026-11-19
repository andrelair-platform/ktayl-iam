import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** How the account is used — governs its recert policy + which approver pair applies. */
export type ServiceAccountType = 'qa' | 'm2m' | 'automation';

/** Lifecycle: requested → (dual-approve + provision, S022/S023) → active → disabled. */
export type ServiceAccountStatus = 'requested' | 'active' | 'disabled';

/**
 * A governed **service / technical (non-human) account** (IGA-06, S021). Distinct from the human
 * `identity` (matricule PK, HR-driven) — a service account has no HR record, no manager, no mailbox;
 * it is accountable to a human `owner` and provisioned to Authentik as a service-account user in one or
 * more groups (the `GROUP_<name>` authority it carries). No credential value is ever stored here — only
 * a `vaultSecretRef` pointing at where the secret lives (S023).
 */
@Entity('service_account')
@Index('uq_service_account_name', ['name'], { unique: true })
export class ServiceAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The Authentik username this account provisions to (e.g. `ktayl-qa-finance`). Unique. */
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName!: string;

  @Column({ type: 'varchar', length: 16 })
  type!: ServiceAccountType;

  /** The human owner (matricule → `identity`) accountable for the account — the recert + revoke target. */
  @Column({ name: 'owner_matricule', type: 'varchar', length: 32 })
  ownerMatricule!: string;

  /** The Authentik group(s) the account is a member of — the `GROUP_<name>` authority(ies) it carries. */
  @Column({ name: 'group_refs', type: 'text', array: true, default: () => "'{}'" })
  groupRefs!: string[];

  @Column({ type: 'varchar', length: 16, default: 'requested' })
  status!: ServiceAccountStatus;

  /** Set once provisioned to Authentik (S023); null until then. */
  @Column({ name: 'authentik_username', type: 'varchar', length: 160, nullable: true })
  authentikUsername!: string | null;

  /** Vault path where the credential lives (S023) — NEVER the secret value itself. */
  @Column({ name: 'vault_secret_ref', type: 'varchar', length: 200, nullable: true })
  vaultSecretRef!: string | null;

  /** The human who filed the request (matricule). */
  @Column({ name: 'created_by', type: 'varchar', length: 32 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  /** When the owner last re-attested the account (S024 recertification); null until first recert. */
  @Column({ name: 'last_recertified_at', type: 'timestamptz', nullable: true })
  lastRecertifiedAt!: Date | null;
}
