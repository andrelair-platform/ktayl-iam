import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S017 Leaver — add the scheduled-revocation columns to `identity` (the table was created by
 * IdentityLifecycle1727000500000 without them). `offboard_date` = HR relieving date; the daily
 * sweep revokes all access strictly after it. `deprovisioned_at` = when revocation ran (idempotency).
 */
export class LeaverColumns1727000600000 implements MigrationInterface {
  name = 'LeaverColumns1727000600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "identity" ADD COLUMN IF NOT EXISTS "offboard_date" date`);
    await q.query(`ALTER TABLE "identity" ADD COLUMN IF NOT EXISTS "deprovisioned_at" timestamptz`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "identity" DROP COLUMN IF EXISTS "offboard_date"`);
    await q.query(`ALTER TABLE "identity" DROP COLUMN IF EXISTS "deprovisioned_at"`);
  }
}
