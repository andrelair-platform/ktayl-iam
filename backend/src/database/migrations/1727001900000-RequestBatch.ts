import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-017 — batch access-requests. A nullable `batch_id` groups N single-role requests into one
 * "demande" (the `batch_id` IS the trackable instance/case id); `batch_label` is an optional
 * human title. Each role keeps its own independent two-leg four-eyes — the batch is a grouping +
 * tracking construct, not a combined approval. Additive + nullable (existing single-role requests
 * keep `batch_id = NULL` and are unchanged).
 */
export class RequestBatch1727001900000 implements MigrationInterface {
  name = 'RequestBatch1727001900000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "request" ADD COLUMN IF NOT EXISTS "batch_id" uuid`);
    await q.query(`ALTER TABLE "request" ADD COLUMN IF NOT EXISTS "batch_label" varchar(160)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_request_batch_id" ON "request" ("batch_id")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_request_batch_id"`);
    await q.query(`ALTER TABLE "request" DROP COLUMN IF EXISTS "batch_label"`);
    await q.query(`ALTER TABLE "request" DROP COLUMN IF EXISTS "batch_id"`);
  }
}
