import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S002 DoD seed: three real governed apps with roles + owners (Homer engineering portal,
 * Grafana, ArgoCD). Idempotent (ON CONFLICT DO NOTHING against the unique names) so re-running
 * on boot is safe. Owner `100001` = the platform admin (the standing second approver until
 * per-app owners are assigned). Groups here are the *intended* Authentik groups the S005 sync
 * engine will create/enforce — recording them is governance, not runtime provisioning.
 */
export class SeedCatalogApps1727000100000 implements MigrationInterface {
  name = 'SeedCatalogApps1727000100000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO "application" ("name", "tier", "authentik_app_ref", "description") VALUES
        ('Homer (engineering portal)', 'internal', 'homer-eng', 'Engineering start page — the role-gated engineering portal'),
        ('Grafana', 'internal', 'grafana', 'Observability dashboards + alerting'),
        ('ArgoCD', 'internal', 'argocd', 'GitOps continuous delivery')
      ON CONFLICT ("name") DO NOTHING`);

    // roles resolve their application_id by the app name; NOT NULL owner is always set.
    const role = (app: string, name: string, group: string, desc: string) => `
      INSERT INTO "role" ("application_id", "name", "owner", "authentik_group_ref", "description")
      SELECT a."id", '${name}', '100001', '${group}', '${desc}'
      FROM "application" a WHERE a."name" = '${app}'
      ON CONFLICT ("application_id", "name") DO NOTHING`;

    await q.query(role('Homer (engineering portal)', 'engineering-portal-access', 'ktayl-engineering', 'Access to the engineering Homer portal'));
    await q.query(role('Grafana', 'grafana-admin', 'ktayl-observability-admin', 'Grafana admin (org + datasource management)'));
    await q.query(role('Grafana', 'grafana-viewer', 'ktayl-observability-viewer', 'Grafana read-only dashboard access'));
    await q.query(role('ArgoCD', 'argocd-admin', 'ktayl-argocd-admin', 'ArgoCD admin (app + project management)'));
    await q.query(role('ArgoCD', 'argocd-readonly', 'ktayl-argocd-readonly', 'ArgoCD read-only access'));

    await q.query(`
      INSERT INTO "audit_log" ("actor", "action", "entity_type", "entity_id", "detail")
      VALUES ('system', 'catalog.seeded', 'application', 'seed', '{"apps":["Homer (engineering portal)","Grafana","ArgoCD"]}')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "application" WHERE "name" IN ('Homer (engineering portal)', 'Grafana', 'ArgoCD')`);
  }
}
