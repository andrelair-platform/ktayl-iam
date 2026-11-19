import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IGA-07 pay-link (ADR-010): the external collaborator's **supplier_ref** — a READ-ONLY reference to the
 * finance/procurement **Supplier** (or contract) record a **paid** contractor is paid against (ERPNext
 * Buying / Procurement #31). IAM only stores + surfaces it; it never creates/writes the finance record.
 * Nullable — an unpaid external party (or a paid one not yet linked) has none. Additive, back-compatible.
 */
export class ExternalCollaboratorSupplierRef1727001500000 implements MigrationInterface {
  name = 'ExternalCollaboratorSupplierRef1727001500000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "external_collaborator" ADD COLUMN IF NOT EXISTS "supplier_ref" varchar(120)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "external_collaborator" DROP COLUMN IF EXISTS "supplier_ref"`);
  }
}
