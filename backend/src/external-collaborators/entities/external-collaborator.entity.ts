import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** How the collaborator engagement is scoped (drives expiry-ceiling + which approver pair applies). */
export type ExternalCollaboratorType = 'contractor' | 'auditor' | 'broker' | 'partner';

/** Lifecycle: requested → (dual-approve + provision) → active → (renew | expired/auto-suspend | flagged | disabled). */
export type ExternalCollaboratorStatus =
  | 'requested'
  | 'active'
  | 'expired'
  | 'disabled'
  | 'flagged';

/**
 * A governed **external collaborator** (IGA-07, S025) — a **human non-employee** (contractor/broker/auditor/
 * partner) who needs scoped platform access but is NOT in the HR system. Distinct from the human `identity`
 * (HR-driven) and the `service_account` (non-human): it is an **IAM-only** identity accountable to an
 * **active-employee sponsor**, time-boxed by a hard **expiry**, and provisioned to Authentik in a scoped set
 * of `GROUP_<name>` groups. The console never writes back to ERPNext (see ADR-009 / operation-authorization-model).
 * No credential value is stored here — provisioning (S027) uses an Authentik invitation.
 */
@Entity('external_collaborator')
@Index('uq_external_collaborator_name', ['name'], { unique: true })
export class ExternalCollaborator {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The Authentik username to provision (e.g. `ext-acme-jdoe`). Unique. */
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName!: string;

  /** Contact + invitation target (external-party PII — handled minimally, audited). */
  @Column({ type: 'varchar', length: 200 })
  email!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: ExternalCollaboratorType;

  /** The accountable internal **sponsor** (matricule → an ACTIVE ERPNext employee; validated at request time, S026). */
  @Column({ name: 'sponsor_matricule', type: 'varchar', length: 32 })
  sponsorMatricule!: string;

  /** Why this external party needs access — mandatory audit reason. */
  @Column({ type: 'text' })
  purpose!: string;

  /** The SCOPED Authentik group(s) granted — specific `GROUP_<name>`, never birthright-plus. */
  @Column({ name: 'group_refs', type: 'text', array: true, default: () => "'{}'" })
  groupRefs!: string[];

  @Column({ type: 'varchar', length: 16, default: 'requested' })
  status!: ExternalCollaboratorStatus;

  /** Set once provisioned to Authentik (S027); null until then. */
  @Column({ name: 'authentik_username', type: 'varchar', length: 160, nullable: true })
  authentikUsername!: string | null;

  /** Hard expiry (ceiling-checked at request/renewal, S026/S028); access auto-suspends past it. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  /** When the engagement was last renewed/re-attested (S028); null until first renewal. */
  @Column({ name: 'last_recertified_at', type: 'timestamptz', nullable: true })
  lastRecertifiedAt!: Date | null;

  /** The admin who filed the request (matricule). */
  @Column({ name: 'created_by', type: 'varchar', length: 32 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
