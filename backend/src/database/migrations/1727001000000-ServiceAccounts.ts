import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IGA-06 / S021: the governed service/technical-account table. A non-human identity accountable to a
 * human `owner_matricule`, provisioned to Authentik as a service-account user in `group_refs` (S023).
 * No credential value is stored — only `vault_secret_ref` (where the secret lives). CHECK constraints
 * pin the enums; schema stays migration-owned (synchronize OFF).
 */
export class ServiceAccounts1727001000000 implements MigrationInterface {
  name = 'ServiceAccounts1727001000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "service_account" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"                varchar(120) NOT NULL,
        "display_name"        varchar(200) NOT NULL,
        "type"                varchar(16)  NOT NULL CHECK ("type" IN ('qa','m2m','automation')),
        "owner_matricule"     varchar(32)  NOT NULL,
        "group_refs"          text[]       NOT NULL DEFAULT '{}',
        "status"              varchar(16)  NOT NULL DEFAULT 'requested'
                                CHECK ("status" IN ('requested','active','disabled')),
        "authentik_username"  varchar(160),
        "vault_secret_ref"    varchar(200),
        "created_by"          varchar(32)  NOT NULL,
        "created_at"          timestamptz  NOT NULL DEFAULT now(),
        "last_recertified_at" timestamptz
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_service_account_name" ON "service_account" ("name")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_service_account_name"`);
    await q.query(`DROP TABLE IF EXISTS "service_account"`);
  }
}
