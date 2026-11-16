import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the remaining platform-engineering tools into the governed catalog so ktayl-iam is the
 * SINGLE source of truth for the engineering access model (not just the three S002 demo apps).
 * This is the catalog side of the platform-access-matrix (minicloud-platform-docs
 * security-enterprise/platform-access-matrix) — the doc records HOW each tool enforces a role
 * (native RBAC vs SSO-gate), this migration records WHICH roles exist + the Authentik group each
 * maps to (governance, not runtime provisioning — the S005 sync engine writes the groups).
 *
 * Two shapes, matching docs/access-role-model.md:
 *  - Native-RBAC tools (multi-level) → a per-app group `ktayl-<app>-<level>` (admin/promoter/viewer).
 *  - SSO-gated binary tools (reach-or-not) → one `access` role on the umbrella `ktayl-engineering`
 *    group (the §4 layer-3 app↔group binding). No per-tool group is minted until a real
 *    "this tool but not that one" need appears (need-first).
 *
 * Backstage reads the BASE persona groups in its PermissionPolicy (the OIDC groups claim →
 * ownership refs), so its roles map to `ktayl-admin` / `ktayl-developer` — this records the
 * reconciliation target for the live Backstage `permission.rbac` config (currently still on the
 * pre-SoR names `platform-admins` / `developers`).
 *
 * Idempotent (ON CONFLICT DO NOTHING on the unique names) so re-running on boot is safe.
 * Owner `100001` = the platform admin (the standing approver until per-app owners are assigned).
 */
export class SeedPlatformToolsCatalog1727000800000 implements MigrationInterface {
  name = 'SeedPlatformToolsCatalog1727000800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO "application" ("name", "tier", "authentik_app_ref", "description") VALUES
        ('Kargo',                'internal',   'kargo',       'Multi-stage promotion (dev→prod freight)'),
        ('Vault',                'restricted', 'vault',       'Secrets management (HashiCorp Vault)'),
        ('Backstage',            'internal',   'backstage',   'Internal developer portal (catalog + golden-path scaffolders)'),
        ('Prometheus',           'internal',   'prometheus',  'Metrics store + query (observability)'),
        ('Alertmanager',         'internal',   'alertmanager','Alert routing + silencing (observability)'),
        ('Hubble UI',            'internal',   'hubble',      'Cilium network-flow observability'),
        ('Polaris',              'internal',   'polaris',     'Kubernetes workload best-practice scanner'),
        ('NATS monitor',         'internal',   'nats',        'NATS/JetStream monitoring UI'),
        ('MLflow',               'internal',   'mlflow',      'ML experiment tracking + model registry'),
        ('Langfuse',             'internal',   'langfuse',    'LLM observability / LLMOps tracing'),
        ('Flowise',              'internal',   'flowise',     'Low-code LLM flow builder'),
        ('Open WebUI',           'internal',   'open-webui',  'LLM chat UI (AI gateway front-end)'),
        ('n8n',                  'internal',   'n8n',         'Workflow automation'),
        ('Temporal',             'internal',   'temporal',    'Durable workflow orchestration UI')
      ON CONFLICT ("name") DO NOTHING`);

    // roles resolve their application_id by the app name; NOT NULL owner is always set.
    const role = (app: string, name: string, group: string, desc: string) => `
      INSERT INTO "role" ("application_id", "name", "owner", "authentik_group_ref", "description")
      SELECT a."id", '${name}', '100001', '${group}', '${desc}'
      FROM "application" a WHERE a."name" = '${app}'
      ON CONFLICT ("application_id", "name") DO NOTHING`;

    // ── Native-RBAC tools (multi-level) → per-app role groups ──────────────────
    await q.query(role('Kargo', 'kargo-admin', 'ktayl-kargo-admin', 'Kargo admin (projects, warehouses, stages)'));
    await q.query(role('Kargo', 'kargo-promoter', 'ktayl-kargo-promoter', 'Kargo promote freight (prod stays CODEOWNERS-gated)'));
    await q.query(role('Kargo', 'kargo-readonly', 'ktayl-kargo-readonly', 'Kargo read-only access'));

    await q.query(role('Vault', 'vault-admin', 'ktayl-vault-admin', 'Vault admin (policies, mounts)'));
    await q.query(role('Vault', 'vault-readonly', 'ktayl-vault-readonly', 'Vault read-only (app secret paths)'));

    await q.query(role('Backstage', 'backstage-admin', 'ktayl-admin', 'Backstage admin (catalog + permission mgmt)'));
    await q.query(role('Backstage', 'backstage-developer', 'ktayl-developer', 'Backstage developer (golden-path scaffolders + read)'));

    // ── SSO-gated binary tools (reach-or-not) → the umbrella engineering group ──
    const binary = (app: string) =>
      role(app, 'access', 'ktayl-engineering', `Reach ${app} (SSO-gated — Authentik app↔group binding)`);
    await q.query(binary('Prometheus'));
    await q.query(binary('Alertmanager'));
    await q.query(binary('Hubble UI'));
    await q.query(binary('Polaris'));
    await q.query(binary('NATS monitor'));
    await q.query(binary('MLflow'));
    await q.query(binary('Langfuse'));
    await q.query(binary('Flowise'));
    await q.query(binary('Open WebUI'));
    await q.query(binary('n8n'));
    await q.query(binary('Temporal'));

    await q.query(`
      INSERT INTO "audit_log" ("actor", "action", "entity_type", "entity_id", "detail")
      VALUES ('system', 'catalog.seeded', 'application', 'seed-platform-tools',
        '{"apps":["Kargo","Vault","Backstage","Prometheus","Alertmanager","Hubble UI","Polaris","NATS monitor","MLflow","Langfuse","Flowise","Open WebUI","n8n","Temporal"]}')`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "application" WHERE "name" IN (
      'Kargo','Vault','Backstage','Prometheus','Alertmanager','Hubble UI','Polaris',
      'NATS monitor','MLflow','Langfuse','Flowise','Open WebUI','n8n','Temporal')`);
  }
}
