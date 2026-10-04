import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S005: the Authentik sync engine tracks per-assignment sync state. `synced_at` null = pending
 * (granted but not yet enforced, or awaiting re-sync after a failure); `last_sync_error` carries
 * the last failure for drift alerting. Both nullable so existing rows start as pending-sync.
 */
export class AssignmentSync1727000300000 implements MigrationInterface {
  name = 'AssignmentSync1727000300000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "assignment" ADD COLUMN IF NOT EXISTS "synced_at" timestamptz`);
    await q.query(`ALTER TABLE "assignment" ADD COLUMN IF NOT EXISTS "last_sync_error" text`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "assignment" DROP COLUMN IF EXISTS "last_sync_error"`);
    await q.query(`ALTER TABLE "assignment" DROP COLUMN IF EXISTS "synced_at"`);
  }
}
