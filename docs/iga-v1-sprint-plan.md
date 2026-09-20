# Sprint Plan — Access Governance Platform v1 (the thin slice)

> **BMAD artefact — SPRINT PLAN + READINESS GATE.** Decomposes the v1 slice into implementable stories
> with ACs and states the readiness verdict. Custom **Path-C** build (NestJS + Next.js + Postgres on
> Authentik). **Status: DRAFT for review.** Stories sync to board **#17** **only at build start** (nothing
> on the board yet).

## Slice goal

**Register an app + its roles → a user requests a role → it is _double-validated_ (manager + role owner) →
the platform provisions the Authentik group + membership → login enforces it**, with a who-has-what view and
a full audit trail. First governed app = **Homer-eng** (replacing today's manual Authentik step).

## Story breakdown

Each: parent epic · priority · estimate · acceptance criteria (happy + failure) · DoD.

### S001 — Platform scaffold + deploy + SSO  · [IGA-01 / infra] · P1 · 5
Stand the app up empty-but-real. NestJS API + Next.js UI + Postgres, GAP wrapper chart, dev up.
- **AC** ✓ NestJS API + Next.js UI build in CI (cosign + SBOM, Trivy gate); ✓ GAP wrapper chart (`services/ktayl-iam/helm/`) renders, dev Healthy; ✓ **admin-only** login via Authentik OIDC.
- **AC (fail)** ✗ DB creds + the Authentik API token come from **ESO→Vault** (none in Git); ✗ default-deny egress (Authentik API + Postgres only).
- **DoD** dev reachable behind SSO; Postgres backup wired (DR-1).

### S002 — Data model + app/role catalog  · [IGA-01 / core] · P1 · 5
The source of truth: Applications → Roles → (later) Assignments.
- **AC** ✓ schema `application` (name, tier, authentik-app-ref) · `role` (name, **owner**, authentik-group-ref) · `assignment` · `request` · `audit_log`; ✓ admin UI + API to **register an app + its roles**; ✓ each Role maps to a named Authentik group.
- **AC (fail)** ✗ a Role must have an **owner** (approver #2) before it can be requested.
- **DoD** ≥3 real apps + roles catalogued (Homer-eng, Grafana, ArgoCD).

### S003 — Directory + manager resolution  · [IGA-01 / integration] · P1 · 5
The two inputs the workflow needs: who exists, and who their manager is.
- **AC** ✓ read **users + groups from Authentik** (read-only); ✓ read the **manager ↔ report hierarchy from ERPNext** (HR SoT) → resolve any user's manager (approver #1).
- **AC (fail)** ✗ manager is **never** taken from the request payload — only from HR (T3); ✗ a user with no resolvable manager can't complete a request (routed to a fallback approver, flagged).
- **DoD** manager lookup demoed for real employees.

### S004 — Access request → DUAL approval (four-eyes)  · [IGA-01 / core] · P1 · 8
**The core control (ADR-007).**
- **AC** ✓ a user requests role R in app A; ✓ it requires **BOTH** the **manager** and the **role owner** to approve (order-independent); ✓ **either denial** rejects it; ✓ each approval records approver/decision/time/comment.
- **AC (fail)** ✗ **no self-approval** — requester ≠ approver enforced **server-side**; if requester is the manager/owner, that leg **reassigns** to a backup (SoD, T1); ✗ nothing is provisioned until **both** approve.
- **DoD** happy path (2 approvals→granted) + both denial paths + the self-approval reassignment tested.

### S005 — Authentik sync engine (provision + reconcile)  · [IGA-01 / integration] · P1 · 8
Turn an approved assignment into real access.
- **AC** ✓ on **both-approved**, create/update the Authentik **group + membership** via the API; ✓ **idempotent** (applied twice = one membership); ✓ **revoke** removes membership; ✓ a scheduled **reconcile** job diffs DB↔Authentik and heals hand-edits (T5) + alerts on drift.
- **AC (fail)** ✗ the Authentik token is **least-privilege** (groups/memberships only, T4); ✗ a failed sync retries, **no lost membership** (AVL-3).
- **DoD** grant→login-enforced demoed end-to-end; drift injected → reconciled.

### S006 — Who-has-what + audit  · [IGA-01 / core] · P2 · 5
The evidence layer.
- **AC** ✓ per-user view (all their app-roles) + per-app view (all users/roles); ✓ **immutable audit** of every request/approval/grant/revoke; ✓ CSV/JSON export for audit.
- **AC (fail)** ✗ who-has-what is **admin/auditor-only** (T7); ✗ audit rows are append-only (T8).
- **DoD** audit export reconciles with Authentik; RED metrics.

### S007 — Govern the first real apps (cutover)  · [IGA-01 / adoption] · P2 · 3
Make it real: the platform takes over the manual steps.
- **AC** ✓ import **Homer-eng** + Grafana + ArgoCD roles/groups into the catalog; ✓ manage their access **through the platform** (grants now flow request→dual-approval→sync) — replacing the by-hand Authentik steps from [homer-rbac-spec](./homer-rbac-spec.md) / [app-authz-bindings](./app-authz-bindings.md).
- **DoD** a real engineer's `homer-eng` access is granted via the platform, not by hand.

> **Later (not v1):** recertification campaigns (IGA-03) · SCIM to business apps (IGA-04) · SoD rules engine (IGA-05) · leaver auto-deprovision · self-service portal polish.

**Slice total ≈ 39 pts.** Sequence: **S001→S002 (platform + catalog) → S003 (inputs) → S004 (dual approval) → S005 (sync) → S006 (evidence) → S007 (cutover).**

## Readiness gate

| Check | Verdict |
|---|---|
| Business need grounded | ✅ [Brief](./brief.md) — governed per-app roles; BYOD = identity is the perimeter |
| Product contract (PRD/NFR/compliance) | ✅ [PRD](./prd.md) + [NFR](./architecture/nfr-register.md) (DORA/ISO/GDPR) |
| Architecture + C4 + ADRs | ✅ [Solution Architecture](./architecture/solution-architecture.md) + [ADRs](./architecture/adr/000-index.md) (001 · 006 custom-build · 007 dual-approval) |
| Threat model (grants access → high value) | ✅ [Threat Model](./architecture/threat-model.md) — T1/T4 (dual approval + least-priv token), T3 (manager from HR), T5 (reconcile), T8/T9 (audit + break-glass) = security-gate blockers |
| Stack decided | ✅ NestJS + Next.js + PostgreSQL (ADR-006) |
| Core control decided | ✅ dual approval — manager + role owner (ADR-007) |
| Scope disciplined | ✅ thin slice (catalog→request→dual-approval→sync→evidence); recert/SCIM/SoD-engine deferred |
| Open (confirm at build start, not blockers) | ⚠️ (a) ERPNext API exposes `reports_to` for manager resolution; (b) mint a **least-privilege Authentik API token** (groups/memberships scope) → Vault |

**Verdict: PASS (Path C).** Design set complete, stack + the dual-approval control decided, dependencies
(Authentik API, ERPNext HR) exist. The two open items are integration confirmations resolvable in S001/S003,
not design blockers.

## After validation
1. BMAD-setup the repo (Path-C: `AGENTS.md` + confirm the planning set) + scaffold `services/ktayl-iam/helm/`.
2. Sync S001–S007 to board **#17** (author them under `bmad/stories/iam/iga-v1-slice/`).
3. Build in sequence — platform first, **dual approval + least-privilege token** enforced, security gate (T1/T3/T4/T5/T8/T9) cleared before prod.
