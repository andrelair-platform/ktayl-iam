import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Application } from './application.entity.js';

/**
 * A role within an application, mapped to a named Authentik group (`authentikGroupRef`).
 * AC-4: a role MUST have an `owner` (the approver #2 in the dual-approval workflow) — the
 * column is NOT NULL, so a role can never exist (and therefore never be requested) ownerless.
 */
@Entity('role')
@Index('uq_role_app_name', ['application', 'name'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Application, (app) => app.roles, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'application_id' })
  application!: Relation<Application>;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** The role owner — matricule of the person who approves grants of this role (approver #2). */
  @Column({ type: 'varchar', length: 32 })
  owner!: string;

  /** The named Authentik group this role provisions membership into (written by S005). */
  @Column({ name: 'authentik_group_ref', type: 'varchar', length: 160 })
  authentikGroupRef!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
