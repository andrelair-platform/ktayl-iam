import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IGA-06 / S022: the governed service-account request + dual-approval table. Mirrors the human
 * `request` four-eyes shape but with service-account legs — a Security/Platform approver (leg 1) and
 * the owner (leg 2) — plus a mandatory `justification`. FK to `service_account` (CASCADE). Nothing is
 * provisioned to Authentik until both legs approve (that is S023). Schema stays migration-owned.
 */
export class ServiceAccountRequests1727001100000 implements MigrationInterface {
  name = 'ServiceAccountRequests1727001100000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_account_request" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "requester_id"       varchar(32) NOT NULL,
        "service_account_id" uuid NOT NULL REFERENCES "service_account"("id") ON DELETE CASCADE,
        "justification"      text NOT NULL,
        "security_approver"  varchar(32),
        "owner_approver"     varchar(32),
        "status"             varchar(20) NOT NULL DEFAULT 'pending'
                               CHECK ("status" IN ('pending','approved','denied','cancelled')),
        "security_decision"  jsonb,
        "owner_decision"     jsonb,
        "created_at"         timestamptz NOT NULL DEFAULT now(),
        "updated_at"         timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_sa_request_service_account" ON "service_account_request" ("service_account_id")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_sa_request_service_account"`);
    await q.query(`DROP TABLE IF EXISTS "service_account_request"`);
  }
}
