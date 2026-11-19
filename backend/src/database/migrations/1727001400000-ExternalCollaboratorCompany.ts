import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IGA-07 enhancement: the external collaborator's **company** (the contractor firm they belong to).
 * Nullable — a **freelance** collaborator has no firm. Additive, back-compatible (existing rows → NULL).
 */
export class ExternalCollaboratorCompany1727001400000 implements MigrationInterface {
  name = 'ExternalCollaboratorCompany1727001400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "external_collaborator" ADD COLUMN IF NOT EXISTS "company" varchar(200)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "external_collaborator" DROP COLUMN IF EXISTS "company"`);
  }
}
