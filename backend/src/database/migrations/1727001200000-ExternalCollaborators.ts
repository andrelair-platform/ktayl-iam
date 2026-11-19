import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IGA-07 / S025: the governed external-collaborator table. A HUMAN non-employee (contractor/broker/
 * auditor/partner) accountable to an active-employee `sponsor_matricule`, time-boxed by `expires_at`,
 * provisioned to Authentik in a scoped `group_refs` set (S027). IAM-only — no ERPNext/workforce record,
 * no credential stored. CHECK constraints pin the enums; schema stays migration-owned (synchronize OFF).
 */
export class ExternalCollaborators1727001200000 implements MigrationInterface {
  name = 'ExternalCollaborators1727001200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "external_collaborator" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"                varchar(120) NOT NULL,
        "display_name"        varchar(200) NOT NULL,
        "email"               varchar(200) NOT NULL,
        "type"                varchar(20)  NOT NULL CHECK ("type" IN ('contractor','auditor','broker','partner')),
        "sponsor_matricule"   varchar(32)  NOT NULL,
        "purpose"             text         NOT NULL,
        "group_refs"          text[]       NOT NULL DEFAULT '{}',
        "status"              varchar(16)  NOT NULL DEFAULT 'requested'
                                CHECK ("status" IN ('requested','active','expired','disabled','flagged')),
        "authentik_username"  varchar(160),
        "expires_at"          timestamptz,
        "last_recertified_at" timestamptz,
        "created_by"          varchar(32)  NOT NULL,
        "created_at"          timestamptz  NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_external_collaborator_name" ON "external_collaborator" ("name")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_external_collaborator_name"`);
    await q.query(`DROP TABLE IF EXISTS "external_collaborator"`);
  }
}
