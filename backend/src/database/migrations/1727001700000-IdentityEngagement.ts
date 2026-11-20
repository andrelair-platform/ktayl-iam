import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-014 — mirror the internal employee's **engagement** onto the identity: `employment_type`
 * (CDI/CDD/Alternance/Stage) + `contract_end_date` (the fixed-term end). The daily leaver sweep then ties
 * a fixed-term employee's access-expiry to the contract end. Additive + nullable (older events → NULL →
 * today's behaviour unchanged; CDI → NULL contract end → no scheduled expiry).
 */
export class IdentityEngagement1727001700000 implements MigrationInterface {
  name = 'IdentityEngagement1727001700000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "identity" ADD COLUMN IF NOT EXISTS "employment_type" varchar(40)`);
    await q.query(`ALTER TABLE "identity" ADD COLUMN IF NOT EXISTS "contract_end_date" date`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "identity" DROP COLUMN IF EXISTS "contract_end_date"`);
    await q.query(`ALTER TABLE "identity" DROP COLUMN IF EXISTS "employment_type"`);
  }
}
