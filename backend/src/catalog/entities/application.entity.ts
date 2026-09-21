import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.entity.js';

/** Access tier (network + sensitivity) — see docs/access-role-model.md §1. */
export type AppTier = 'public' | 'internal' | 'restricted';
export const APP_TIERS: AppTier[] = ['public', 'internal', 'restricted'];

/**
 * A governed application in the ktayl IS. The catalog is the SOURCE OF TRUTH for what
 * applications exist and which roles they have. Runtime enforcement is Authentik's
 * (`authentikAppRef` = the Authentik Application slug); this row is the governance record.
 */
@Entity('application')
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  tier!: AppTier;

  /** The Authentik Application slug this governs (the enforcement object). */
  @Column({ name: 'authentik_app_ref', type: 'varchar', length: 160 })
  authentikAppRef!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @OneToMany(() => Role, (role) => role.application)
  roles!: Relation<Role[]>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
