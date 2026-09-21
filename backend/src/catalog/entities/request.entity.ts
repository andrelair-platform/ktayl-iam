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
import { Role } from './role.entity.js';

export type RequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

/** A single approval leg (manager or role owner) — recorded on the request. */
export interface ApprovalDecision {
  approver: string; // matricule
  decision: 'approved' | 'denied';
  at: string; // ISO timestamp
  comment?: string;
}

/**
 * An access request (user wants role R). Schema is introduced in S002; the dual-approval
 * (four-eyes) workflow that fills `managerDecision` + `ownerDecision` and drives `status`
 * lands in S004 (the core control, ADR-007).
 */
@Entity('request')
export class Request {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'requester_id', type: 'varchar', length: 32 })
  requesterId!: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: Relation<Role>;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: RequestStatus;

  @Column({ name: 'manager_decision', type: 'jsonb', nullable: true })
  managerDecision!: ApprovalDecision | null;

  @Column({ name: 'owner_decision', type: 'jsonb', nullable: true })
  ownerDecision!: ApprovalDecision | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
