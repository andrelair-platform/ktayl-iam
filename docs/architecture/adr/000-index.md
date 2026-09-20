# ADR Log — Access Governance (IAM/IGA) (#17)

> **BMAD/SA artefact.** Access-governance decisions + rationale. **Status: DRAFT / Proposed.**

| ADR | Title | Status | Owner |
|---|---|---|---|
| [001](#adr-001) | Authentik = IdP + enforcement; a **custom platform** = the governance/source-of-truth layer | Proposed | SA/SEC |
| [002](#adr-002) | Role model = personas × access tiers (business vs engineering) | Proposed | SA/SEC |
| [003](#adr-003) | Authorize at the Authentik Application↔group binding (not per-app hacks) | Proposed | SA/SEC |
| [004](#adr-004) | Homer RBAC via two group-gated portals (static app → can't self-filter) | Proposed | SA/SEC |
| [005](#adr-005) | Least-privilege + birthright: `ktayl-business` default, engineering additive/requestable | Proposed | SA/SEC |
| [006](#adr-006) | **Custom-build** the governance platform (NestJS + Next.js + Postgres) — not off-the-shelf MidPoint | Proposed | SA/TL |
| [007](#adr-007) | **Dual approval (four-eyes): manager + role owner** before any grant is provisioned | Proposed | SA/SEC |
| [008](#adr-008) | **Matricule** = immutable 6-digit employee ID (from ERPNext) = Authentik username | Proposed | SA/TL |

## ADR-001 — Authentik = IdP + enforcement; a custom platform = the governance layer {#adr-001}
**Context.** **Authentik is our "Entra"** — the directory where every employee lives + the runtime
**enforcement** (groups gate app access at login). What's missing is a **governed way to decide + record**
which role each user gets in each app.
**Decision.** **Authentik stays the IdP + the policy-enforcement point** (groups, forward-auth, OIDC). We
**build a custom Access Governance Platform** as the **system of record + administration layer** (PAP): it
models Applications→Roles→assignments, runs request/approval, and **provisions Authentik groups +
memberships** via the Authentik API. The platform decides & records; Authentik enforces. **We do not
re-implement authentication.**
**Consequences.** Clean separation (directory/enforcement vs governance); the platform is off the live
request path, so already-granted access survives it being down. Cost: it's a real product to build (ADR-006).

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
requestable** (→ approval **in the custom platform**); `ktayl-admin` is **break-glass** (sealed, audited).
**Consequences.** Minimises standing access; SoD/recertification (IGA-03/05) build on it.

## ADR-006 — Custom-build the governance platform (not off-the-shelf MidPoint) {#adr-006}
**Context.** The governance/administration layer (apps→roles→assignments, request/approval, who-has-what,
provision to Authentik) can be **bought** (an off-the-shelf IGA suite, e.g. **MidPoint**) or **built**.
Per the org [stack-selection rule](https://github.com/andrelair-platform/minicloud-gitops/blob/main/.claude/rules/tech-stack-selection.md),
choose per project. The owner's intent is a **custom platform** that suits how the rest of the IS is built
and is a portfolio-grade deliverable.
**Decision.** **Build it** as a custom app (this is a **Path C** product, not a deploy-and-configure). Stack:
- **API + workflow + Authentik-sync = NestJS (TypeScript)** — structured/DI, one language across API + UI.
- **Admin UI = Next.js + React**.
- **Datastore = PostgreSQL** — the source of truth for Applications/Roles/Assignments/audit.
- **Integration = Authentik API** — the platform **writes** groups + memberships (WRITE) and **reads** the
  employee directory (READ). Authentik stays the **IdP + enforcement**; we never re-implement auth.
- **Deployment = GAP wrapper chart** (dev+prod) + Kargo, ESO→Vault (the least-privilege Authentik API
  token + DB creds), SSO via Authentik — same standard as the other custom services.

**Rejected: off-the-shelf MidPoint (Evolveum).** Mature and full-featured, but (a) the owner wants to
*build* this capability, (b) it's a heavyweight Java app configured in XML/Groovy — more to run/learn than
our need, and (c) a custom build is the stronger portfolio artefact and fits the "we build our IS" ethos.
Recorded as the **buy-instead** alternative should scale ever demand it.
**Consequences.** A real product to design, build, secure and operate (identity-adjacent → harden + audit).
In return: full control, exactly the "each app has roles → grant users the role they need" capability, and
a portfolio-grade IGA build. **Homer RBAC + the per-app Authentik bindings remain valid** — they're the
first apps this platform will govern (interim: their Authentik groups are set by hand until the platform
automates them).

## ADR-007 — Dual approval (four-eyes): manager + role owner {#adr-007}
**Context.** Granting a role in an app is a privileged action; a single approver is a weak control (self-
service rubber-stamp, insider risk) and doesn't satisfy least-privilege / SoD expectations (DORA, ISO-27001).
**Decision.** Every role request requires **two independent approvals before provisioning**: **(1) the
requester's line manager** (resolved from the HR org hierarchy in ERPNext) **and (2) the role owner**
(defined on the Role). **Both** must approve (order-independent); **either** denial rejects the request;
**access is provisioned to Authentik only after both** — never on one. **Separation of duties:** the
requester can never approve their own request; if the requester is the manager or the role owner, that leg
reassigns to a backup (manager's manager / secondary owner). Every step is audit-logged.
**Consequences.** Strong, auditable authorization control (four-eyes) → real DORA/ISO access-control
evidence. Requires the platform to know the **manager relationship** (ERPNext dependency) and each Role's
**owner**. Cost: two approvals add latency to a grant — accepted (correctness > speed for access). A
**break-glass** path (admin, sealed + heavily audited) exists for emergencies, outside the normal dual flow.

## ADR-008 — Matricule: immutable employee ID as the user identifier {#adr-008}
**Context.** Users need a **stable** identifier. Names and emails change (marriage, corrections, role
moves); using them as keys corrupts joins + audit over time. An enterprise/insurer (HDI shape) keys on an
immutable **matricule** (employee ID).
**Decision (owner, 2026-09-20).** Every user has an immutable **matricule**:
- **Format:** a **6-character, zero-padded string** (range `100000`–`999999`; stored as a **string**, never
  an integer — no arithmetic, leading zeros preserved). **Never reused** (a leaver's matricule is retired).
- **Source of truth = ERPNext HR** (the Employee ID) — the same HR system the platform reads managers from (S003).
- **It IS the Authentik username** (login = the matricule, e.g. `100001` — option (a): unambiguous, enterprise-real).
- **Technical PK in the IAM DB stays the Authentik `sub`** (cryptographically stable); the matricule is the
  **business key** carried as an attribute → even if a username/handle ever changes, assignments + audit don't break.
- **Email + display name stay human-readable** (e.g. `a.kanmegne@devandre.sbs`, "Andre Kanmegne") and mutable —
  they're for people, not for keys.
**Consequences.** Stable joins across **HR ↔ Authentik ↔ IAM ↔ every app** + a durable audit trail; the
"log in with a number" feel of a real carrier. Cost: a matricule is less memorable than a name (accepted).
**Migration:** existing name-based usernames (e.g. `kanmegnea`) move to matricules **deliberately** — mint the
matricule in ERPNext → set it as the Authentik username → because the IAM platform keys on `sub`, nothing breaks.
New users get a matricule at onboarding.
