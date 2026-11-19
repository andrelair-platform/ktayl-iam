import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IGA-07 / S026: the external-collaborator request + Sponsor+Security dual-approval. One row per
 * onboarding request; `collaborator_id` FK → `external_collaborator` (CASCADE). The two legs
 * (sponsor + security) + their jsonb decisions drive the four-eyes gate. CHECK pins the status enum.
 */
export class ExternalCollaboratorRequests1727001300000 implements MigrationInterface {
  name = 'ExternalCollaboratorRequests1727001300000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "external_collaborator_request" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "requester_id"      varchar(32) NOT NULL,
        "collaborator_id"   uuid        NOT NULL
                              REFERENCES "external_collaborator"("id") ON DELETE CASCADE,
        "sponsor_approver"  varchar(32),
        "security_approver" varchar(32),
        "status"            varchar(20) NOT NULL DEFAULT 'pending'
                              CHECK ("status" IN ('pending','approved','denied','cancelled')),
        "sponsor_decision"  jsonb,
        "security_decision" jsonb,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_ec_request_collaborator" ON "external_collaborator_request" ("collaborator_id")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "ix_ec_request_collaborator"`);
    await q.query(`DROP TABLE IF EXISTS "external_collaborator_request"`);
  }
}
