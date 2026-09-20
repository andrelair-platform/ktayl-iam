# ADR Log — Access Governance (IAM/IGA) (#17)

> **BMAD/SA artefact.** Access-governance decisions + rationale. **Status: DRAFT / Proposed.**

| ADR | Title | Status | Owner |
|---|---|---|---|
| [001](#adr-001) | Authentik groups = runtime PEP; MidPoint = governing source of truth | Proposed | SA/SEC |
| [002](#adr-002) | Role model = personas × access tiers (business vs engineering) | Proposed | SA/SEC |
| [003](#adr-003) | Authorize at the Authentik Application↔group binding (not per-app hacks) | Proposed | SA/SEC |
| [004](#adr-004) | Homer RBAC via two group-gated portals (static app → can't self-filter) | Proposed | SA/SEC |
| [005](#adr-005) | Least-privilege + birthright: `ktayl-business` default, engineering additive/requestable | Proposed | SA/SEC |
| [006](#adr-006) | Technology stack: deploy-and-configure (Authentik + MidPoint), not a custom build | Proposed | SA/TL |

## ADR-001 — Authentik = PEP, MidPoint = source of truth {#adr-001}
**Context.** We need role-based authorization now, and governed lifecycle (request/approve/recertify) later.
**Decision.** **Authentik groups** are the **runtime policy-enforcement point** (forward-auth reads them
today). **MidPoint IGA** becomes the **source of truth / PAP** that *provisions* those groups (IGA-01/02/04);
Authentik stays the PEP. Don't wait for MidPoint to get RBAC — enforce on Authentik groups now, govern them
with MidPoint next.
**Consequences.** Immediate RBAC + a clean path to full IGA. Interim: group membership is manual until MidPoint.

## ADR-002 — Role model = personas × tiers {#adr-002}
**Context.** BYOD → identity is the perimeter; need a legible model, not ad-hoc groups.
**Decision.** Personas (**business · developer · devops · data · sre · admin**) × access tiers
(**Public · Internal(Tailscale) · Restricted**), with an explicit entitlement matrix
([access-role-model.md](../../access-role-model.md)).
**Consequences.** Every app maps to the matrix; new apps get an entitlement by construction. Auditable.

## ADR-003 — Authorize at the Authentik Application↔group binding {#adr-003}
**Context.** Apps are authenticated (SSO) but not authorized by role; per-app bespoke authz would sprawl.
**Decision.** Enforce authorization by binding each **Authentik Application** to its entitled **group**
(the nginx outpost returns 403 otherwise). One consistent mechanism across all forward-auth apps; in-app
RBAC (Grafana/ArgoCD/ERPNext) layers underneath.
**Consequences.** Uniform, central, auditable authz. Config lives in Authentik (not GitOps) — record it.

## ADR-004 — Homer RBAC = two group-gated portals {#adr-004}
**Context.** Homer is a **static** dashboard — it cannot filter links by user/role at runtime.
**Decision.** Split into a **business Company Portal** (birthright, all staff) and an **Engineering Platform
Portal** (`homer-eng`, Tailscale + engineer-group policy). Not a runtime filter, not one shared config.
**Consequences.** Robust, GitOps-able, defense-in-depth (network + role). Cost: two ConfigMaps/workloads.
Full spec: [homer-rbac-spec.md](../../homer-rbac-spec.md).

## ADR-005 — Least privilege + birthright {#adr-005}
**Context.** Default-allow (everyone sees everything) is the current gap.
**Decision.** `ktayl-business` is **birthright** (all staff); engineering groups are **additive +
requestable** (→ MidPoint approval); `ktayl-admin` is **break-glass** (sealed, audited).
**Consequences.** Minimises standing access; SoD/recertification (IGA-03/05) build on it.

## ADR-006 — Technology stack: deploy-and-configure, not a custom build {#adr-006}
**Context.** IGA is a solved problem with mature OSS; per the org
[stack-selection rule](https://github.com/andrelair-platform/minicloud-gitops/blob/main/.claude/rules/tech-stack-selection.md)
(best-fit per project), building an identity platform from scratch would be wrong. IAM #17 is **Path B
(deploy-and-configure)**, like ITSM/GLPI #16 — the "development" is standing up + configuring tools, not
authoring an app.
**Decision.**
- **Runtime IdP + PEP = Authentik** (already deployed) — **config only** (the `ktayl-*` groups + the
  Application↔group policy bindings of ADR-003). Not GitOps (same class as OIDC providers/robots).
- **IGA source of truth = MidPoint** (Evolveum) — **Java/Spring OSS + PostgreSQL**, configured in **XML**
  (roles/org/resources) + **Groovy** (mappings/expressions), provisioning via **ConnId/SCIM** connectors,
  REST API. This is what IGA-01/02/04 build. We *configure* MidPoint; we do **not** author a custom Java app.
- **Deployment = GAP wrapper Helm chart** in `minicloud-gitops` + a **custom image** (CA trust, connectors),
  ESO→Vault secrets, ingress+cert, Kargo — same standard as GLPI/retrieva.
- **Homer RBAC (first application) = GitOps YAML** (Kustomize manifests: ConfigMap split + `homer-eng`
  workload/ingress) + the Authentik group policy — **zero application code**.
- **Custom glue = only if forced** — a small SCIM/sync **connector** where MidPoint's ConnId connectors
  don't cover a target app; language per the stack rule (**Python/FastAPI or Go**), best-fit per case. Not
  expected in v1.
**Consequences.** v1 (role model + Homer RBAC) ships with **no application code** (Authentik config + GitOps
YAML); full IGA is **MidPoint you deploy+configure** (XML/Groovy), not a bespoke build; custom code appears
only for an unavoidable connector. Cost: MidPoint's XML/Groovy config has a learning curve — accepted, it's
the credible IGA path and avoids reinventing identity governance.
