import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-012 correction: an external collaborator is a **worker**, not a supplier. Drop the mislabelled
 * `supplier_ref` (ADR-010, nullable + unused) and replace it with **`hr_worker_ref`** — the canonical
 * ERPNext **Employee** id (`HR-EMP-xxxxx`) of the *non-payroll HR worker* record that n8n creates for them
 * and binds back here (IAM never writes ERPNext — ADR-009). Nullable: null until the HR worker is bound.
 */
export class ExternalCollaboratorHrWorkerRef1727001600000 implements MigrationInterface {
  name = 'ExternalCollaboratorHrWorkerRef1727001600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "external_collaborator" DROP COLUMN IF EXISTS "supplier_ref"`);
    await q.query(
      `ALTER TABLE "external_collaborator" ADD COLUMN IF NOT EXISTS "hr_worker_ref" varchar(60)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "external_collaborator" DROP COLUMN IF EXISTS "hr_worker_ref"`);
    await q.query(`ALTER TABLE "external_collaborator" ADD COLUMN IF NOT EXISTS "supplier_ref" varchar(120)`);
  }
}
