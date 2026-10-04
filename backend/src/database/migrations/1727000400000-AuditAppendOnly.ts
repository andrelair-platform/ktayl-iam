import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S006 (AC-4 / threat T8): make the audit trail append-only at the DATABASE level, not just by
 * convention. PostgreSQL rewrite rules turn any UPDATE/DELETE on `audit_log` into a no-op, so even
 * a compromised app role (or a stray query) cannot alter or erase an audit row — only INSERT works.
 */
export class AuditAppendOnly1727000400000 implements MigrationInterface {
  name = 'AuditAppendOnly1727000400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE RULE "audit_log_no_update" AS ON UPDATE TO "audit_log" DO INSTEAD NOTHING`);
    await q.query(`CREATE OR REPLACE RULE "audit_log_no_delete" AS ON DELETE TO "audit_log" DO INSTEAD NOTHING`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP RULE IF EXISTS "audit_log_no_update" ON "audit_log"`);
    await q.query(`DROP RULE IF EXISTS "audit_log_no_delete" ON "audit_log"`);
  }
}
