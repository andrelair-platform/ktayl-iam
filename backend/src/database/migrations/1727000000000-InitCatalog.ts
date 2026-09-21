import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S002 initial schema: the application/role catalog + the governance tables it will drive
 * (assignment/request for S004-S006) + the append-only audit_log. gen_random_uuid() is core
 * in the PostgreSQL 18 image. synchronize stays OFF — this migration owns the schema.
 */
export class InitCatalog1727000000000 implements MigrationInterface {
  name = 'InitCatalog1727000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "application" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "tier" varchar(20) NOT NULL,
        "authentik_app_ref" varchar(160) NOT NULL,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_application_name" UNIQUE ("name")
      )`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "role" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "application_id" uuid NOT NULL REFERENCES "application"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "owner" varchar(32) NOT NULL,
        "authentik_group_ref" varchar(160) NOT NULL,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_role_app_name" UNIQUE ("application_id", "name")
      )`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "assignment" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar(32) NOT NULL,
        "role_id" uuid NOT NULL REFERENCES "role"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "granted_by" varchar(32),
        "revoked_by" varchar(32),
        "revoked_at" timestamptz,
        "granted_at" timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "request" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "requester_id" varchar(32) NOT NULL,
        "role_id" uuid NOT NULL REFERENCES "role"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "manager_decision" jsonb,
        "owner_decision" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor" varchar(32) NOT NULL,
        "action" varchar(60) NOT NULL,
        "entity_type" varchar(40) NOT NULL,
        "entity_id" varchar(64) NOT NULL,
        "detail" jsonb NOT NULL DEFAULT '{}',
        "at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_audit_entity" ON "audit_log" ("entity_type", "entity_id")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "audit_log"`);
    await q.query(`DROP TABLE IF EXISTS "request"`);
    await q.query(`DROP TABLE IF EXISTS "assignment"`);
    await q.query(`DROP TABLE IF EXISTS "role"`);
    await q.query(`DROP TABLE IF EXISTS "application"`);
  }
}
