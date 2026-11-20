import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-015 — give an external collaborator the SAME workplace tier as an employee: a company mailbox
 * (`workplace_email`, separate from their contact `email`) + the birthright `Workplace Users` group (granted at
 * provision time, no schema needed). Additive + nullable; `workplace_email` is UNIQUE so the workplace namespace
 * can't double-allocate an address across the employee + external populations.
 */
export class ExternalCollaboratorWorkplaceMailbox1727001800000 implements MigrationInterface {
  name = 'ExternalCollaboratorWorkplaceMailbox1727001800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "external_collaborator" ADD COLUMN IF NOT EXISTS "workplace_email" varchar(190)`);
    await q.query(
      `ALTER TABLE "external_collaborator" ADD COLUMN IF NOT EXISTS "mailbox_provisioned" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_external_collaborator_workplace_email" ON "external_collaborator" ("workplace_email")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_external_collaborator_workplace_email"`);
    await q.query(`ALTER TABLE "external_collaborator" DROP COLUMN IF EXISTS "mailbox_provisioned"`);
    await q.query(`ALTER TABLE "external_collaborator" DROP COLUMN IF EXISTS "workplace_email"`);
  }
}
