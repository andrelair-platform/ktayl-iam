# ADR Log — Access Governance (IAM/IGA) (#17)

> **BMAD/SA artefact.** Access-governance decisions + rationale. **Status: DRAFT / Proposed.**

| ADR | Title | Status | Owner |
|---|---|---|---|
| [001](#adr-001) | Authentik groups = runtime PEP; MidPoint = governing source of truth | Proposed | SA/SEC |
| [002](#adr-002) | Role model = personas × access tiers (business vs engineering) | Proposed | SA/SEC |
| [003](#adr-003) | Authorize at the Authentik Application↔group binding (not per-app hacks) | Proposed | SA/SEC |
| [004](#adr-004) | Homer RBAC via two group-gated portals (static app → can't self-filter) | Proposed | SA/SEC |
| [005](#adr-005) | Least-privilege + birthright: `ktayl-business` default, engineering additive/requestable | Proposed | SA/SEC |

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
