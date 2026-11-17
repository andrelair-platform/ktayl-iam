import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Register the **ktayl-core** insurance-LOB application (modular monolith: policy, billing,
 * screening, submission, complaints) and the **functional/departmental roles** it enforces at its
 * API, so access to it is governed in the catalog (the SoR) — including the RC-02 sanctions-screening
 * flow (the Submission intake + bind/payment HOLD gates + the screening alert decisions).
 *
 * `authentik_group_ref` is set to EXACTLY the group ktayl-core checks at runtime
 * (`@PreAuthorize("hasAuthority('GROUP_<name>')")` → the Authentik `groups` claim entry `<name>`): so
 * the catalog mirrors enforcement, not a convention. These are the insurer's *functional* groups
 * (Underwriting / Compliance / Finance / Complaints Handler) — the departmental sub-roles layered on the
 * `ktayl-business` birthright persona (access-role-model.md). A later reconciliation to the `ktayl-*`
 * naming convention can rename both the group and this ref together; for now the SoR records reality.
 *
 * Idempotent (ON CONFLICT DO NOTHING). Owner `100001` = the platform admin (standing second approver).
 */
export class SeedKtaylCoreRoles1727000900000 implements MigrationInterface {
  name = 'SeedKtaylCoreRoles1727000900000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO "application" ("name", "tier", "authentik_app_ref", "description") VALUES
        ('ktayl-core (Insurance LOB)', 'internal', 'ktayl-core', 'Insurance-LOB modular monolith — policy, billing, screening (AML/sanctions), submission intake; the bind/payment/intake HOLD gates')
      ON CONFLICT ("name") DO NOTHING`);

    const role = (app: string, name: string, group: string, desc: string) => `
      INSERT INTO "role" ("application_id", "name", "owner", "authentik_group_ref", "description")
      SELECT a."id", '${name}', '100001', '${group}', '${desc}'
      FROM "application" a WHERE a."name" = '${app}'
      ON CONFLICT ("application_id", "name") DO NOTHING`;

    const APP = 'ktayl-core (Insurance LOB)';
    await q.query(role(APP, 'underwriter', 'Underwriting',
      'Submission workbench (intake/triage/route) + policy binding — the Underwriting desk'));
    await q.query(role(APP, 'compliance-officer', 'Compliance',
      'Sanctions-screening alert decisions (HITL) + clearing a submission screening-hold — the Compliance desk'));
    await q.query(role(APP, 'finance-officer', 'Finance',
      'Premium payment initiation (the Billing payment endpoint, behind the sanctions payment-gate)'));
    await q.query(role(APP, 'complaints-handler', 'Complaints Handler',
      'Complaints register (the Complaints module)'));

    await q.query(`
      INSERT INTO "audit_log" ("actor", "action", "entity_type", "entity_id", "detail")
      VALUES ('system', 'catalog.seeded', 'application', 'seed', '{"app":"ktayl-core (Insurance LOB)","roles":["underwriter","compliance-officer","finance-officer","complaints-handler"]}')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "application" WHERE "name" = 'ktayl-core (Insurance LOB)'`);
  }
}
