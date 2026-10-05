import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S015/S016 — the `identity` table: a person onboarded from an HR Joiner event, keyed by matricule,
 * making them a requestable subject of the access-request flow. Mirrors the Identity entity.
 */
export class IdentityLifecycle1727000500000 implements MigrationInterface {
  name = 'IdentityLifecycle1727000500000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "identity" (
        "matricule"                varchar(32)  PRIMARY KEY,
        "full_name"                varchar(160) NOT NULL,
        "email"                    varchar(190),
        "department"               varchar(120),
        "entity"                   varchar(120),
        "country"                  varchar(80),
        "job"                      varchar(60),
        "status"                   varchar(20)  NOT NULL DEFAULT 'active',
        "authentik_provisioned"    boolean      NOT NULL DEFAULT false,
        "mailbox_provisioned"      boolean      NOT NULL DEFAULT false,
        "initial_mailbox_password" varchar(64),
        "last_event_at"            timestamptz,
        "created_at"               timestamptz  NOT NULL DEFAULT now(),
        "updated_at"               timestamptz  NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_identity_email" ON "identity" ("email")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "identity"`);
  }
}
