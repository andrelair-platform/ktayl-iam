# IAM Console — Operation Authorization Model (who can *do* what)

> **Status: DESIGN (for review) · 2026-11-19.** Companion to [`access-role-model.md`](./access-role-model.md)
> (IGA-02) and the [PRD](./prd.md). This doc is the authority for **what operations a signed-in user may
> perform *inside the IAM console itself*** — the console's own least-privilege RBAC. It evolves the PRD's
> *"admin-first v1"* posture into an **all-employees, least-privilege-by-persona** model and draws the
> **HR boundary** explicitly. It drives the role-aware UI in [`frontend-redesign.md`](./frontend-redesign.md).

## Two different "role" questions — don't conflate them
| Question | Answered by |
|---|---|
| *What access roles exist across the IS, and who is entitled to them?* (the catalog this app **governs**) | [`access-role-model.md`](./access-role-model.md) — personas → Authentik groups → entitlements |
| **What can a user *operate* in the IAM console?** (request vs approve vs provision vs onboard) | **this doc** |

The first is the **subject matter**; the second is the **console's own authorization**. A user can be a plain
*business* persona in the role-model yet still legitimately **request** access and **approve** their own
reports' requests here — those are console operations, gated below.

## The principle
> **Every employee uses the console (self-service access governance), but each operation is least-privilege
> by persona.** A normal employee can *request* access to a tool; they cannot *create an external
> collaborator*, *mint a service account*, or *manage the catalog* — those are **IT/Admin** operations. And
> **nobody creates employees here at all** — that is the HR system's job (see *The HR boundary*).

## Operation personas (console-level — distinct from the entitlement personas)
| Persona | Who (how we know) | In the console they are… |
|---|---|---|
| **Employee** | any authenticated Authentik user (birthright `ktayl-business`) | the self-service requester — requests access, tracks their own, recertifies what they own |
| **Approver** *(contextual, not a standing role)* | the **manager** (from ERPNext) or the **resource/role owner** named on a specific request | may decide **only the legs assigned to them** (four-eyes) |
| **IT / Platform Admin** | member of `Platform Admins` / `ktayl-admin` → `AuthUser.isAdmin = true` | the privileged governance operator (catalog, service accounts, external collaborators, provisioning, reconciliation, full audit) |
| **Security approver** *(contextual)* | the configured `SECURITY_APPROVER` matricule | the Security leg of a **service-account** request (IGA-06 four-eyes) |
| **AI / automation service principal** | M2M client-credentials (no human) | out of scope for the UI; governed separately (IGA-06 / ADR-0004) |

> **HR is *not* a console persona.** HR staff appear here only as ordinary **employees** (self-service).
> Their user-administration work happens in the **HR system**, not in this console (next section).

## The operation permission matrix
✅ allowed · ◐ conditional (see note) · — denied. Enforcement column = how it's gated (today / target).

| Operation | Employee | Approver | IT/Admin | Gate |
|---|:--:|:--:|:--:|---|
| Sign in to the console | ✅ | ✅ | ✅ | `AuthenticatedGuard` (any Authentik user) |
| Request access to a tool/role **for myself** | ✅ | ✅ | ✅ | open route + workflow self-check |
| Track **my own** requests / approvals | ✅ | ✅ | ✅ | self-scoped query |
| Decide (approve/deny) a request leg | ◐ | ✅ | ✅ | workflow: **approver must be the assigned leg**, never the requester (no self-approval) |
| Recertify an access **I own** | ◐ | ◐ | ✅ | owner-or-admin check |
| View the application/role **catalog** | read | read | ✅ manage | read open · write `@AdminOnly` |
| Register / edit applications + roles | — | — | ✅ | `@AdminOnly` |
| Create a **service account** (non-human) | — | — | ✅ | `@AdminOnly` (IGA-06) + four-eyes to provision |
| Onboard an **external collaborator** (human non-employee) | — | — | ✅ | `@AdminOnly` + sponsor + expiry (see below) |
| Provision / disable an identity | — | — | ✅ | `@AdminOnly` |
| Run Authentik reconciliation | — | — | ✅ | `reconcile:run` |
| **Reassign / override a stuck approval leg** (reason required) | — | — | ✅ | `requests:reassign` + audited reason |
| View the **full** audit log / exports | ◐ own actions | — | ✅ full | `audit:read:all` (self → `audit:read:self`) |

> **Gate column = the capability the operation maps to** (see *Enforcement* below). "`@AdminOnly`" is the
> current mechanism; it becomes `@RequireCapability(<name>)` so the role→capability map is the one edit point.

◐ notes: *Decide* — only on legs where the user is the named manager/owner (the UI shows the decide
controls only then). *Recertify* — the account/grant **owner** or an admin. *Audit* — an employee sees their
own actions reflected in their request timeline; the **searchable org-wide log/export** is admin-only.

## The HR boundary — the IAM console does NOT create employees
This is the decisive scope line (and a frequent misunderstanding):

- **Employee identities are created and lifecycle-managed in the HR system (ERPNext HR), not here.** A new
  hire, a role change, a departure — *Joiner / Mover / Leaver* — originate in ERPNext. The IAM platform
  **consumes** those as signed lifecycle events (the existing JML intake, S015/S016) and **provisions /
  deprovisions** the Authentik identity + birthright access accordingly.
- Therefore the console has **no "create employee" / "edit employee HR record" screen**, for anyone —
  including HR staff. Putting employee creation here would duplicate the HR system and split the source of
  truth for the workforce.
- What the console **does** with HR data: read the **matricule** (= Authentik username) and the **manager
  hierarchy** (to route manager approval). Read-only, consumer side.
- **One-directional — the console never writes back to ERPNext.** It consumes HR (JML events, sponsor
  validity, manager hierarchy) and never creates/edits an HR record. In particular, **external collaborators
  are IAM-only identities that never trigger or write back to ERPNext** (they have no workforce record).

```
 HR system (ERPNext) ──JML events──▶ IAM platform ──provision──▶ Authentik (runtime enforcement)
   owns employees                     governs ACCESS                 enforces at login
   (create/mover/leaver)              (request→approve→grant)
```

**Litmus test:** *"Is this about who the person IS (an employee record), or about what they may ACCESS?"*
Identity/HR record → **HR system**. Access grant/role/provisioning → **this console** (persona-gated above).

## External collaborators — a new, IT/Admin-only capability (design intent)
A **human non-employee** who needs platform access — a contractor, a broker, an external auditor, a partner.
They are **not in the HR system** (not on payroll), so they **cannot** arrive via the HR Joiner flow, and an
ordinary employee must **not** be able to mint one. The console is therefore the right home, under **IT/Admin**
governance, shaped like the service-account control but for a human:

- **Who may create one:** IT/Admin only (`collaborators:manage`).
- **The sponsor is an active internal employee, synced from ERPNext.** The accountable sponsor **must** be a
  current employee (validated live against the HR directory) — a terminated/unknown matricule **cannot** be
  assigned as sponsor. The sponsor is the human on the hook for the collaborator's access.
- **Approval = Sponsor + Security (four-eyes)** for anything beyond read-only, and for any production /
  sensitive scope (Decision #2). The business sponsor wants the work unblocked and may over-provision;
  **Security is the guardrail on scope + expiry duration.**
- **Mandatory governance fields:** sponsor (`name · matricule`), **purpose/justification**, a **scoped
  entitlement** (specific group(s)/app(s) — never birthright-plus), and an **expiry with a hard ceiling**
  (default ~90 days, max ~180) requiring **explicit renewal** before it — no indefinite access.
- **Lifecycle:** request → Sponsor + Security approval → provision a **scoped** Authentik account →
  **renew/recertify before expiry** → else **auto-suspend**. Fully audited, same shape as service accounts.
- **Sponsor-Leaver safety net:** if the sponsor triggers an **ERPNext Leaver event**, all their active
  external collaborators are **automatically flagged for reassignment or suspended** — closing the classic
  orphaned-access vector (collaborators bypass the HR JML lifecycle, so this is their equivalent safeguard).
- **One-directional — never writes back to HR.** An external collaborator is an **IAM-only identity**; it
  **never triggers or writes back to ERPNext** and has **no HR/workforce record**. IAM *consumes* ERPNext
  (sponsor validity, Leaver events); it never creates HR data. (See *The HR boundary*.)
- **Not** an HR operation, **not** employee self-service. *(Build status: **SHIPPED** — IGA-07 / ADR-009 +
  S025–S030, PRs #107–#111.)*

## Enforcement — capability flags, not a raw `isAdmin` boolean (DECIDED 2026-11-19)
**One `Admin` tier is active now, but the console checks a *capability*, never a bare `isAdmin` scattered
across routes and UI.** This keeps a future split (an `IT Operator` who onboards collaborators + service
accounts but can't edit governance config) a **config change**, not a codebase refactor.

- **Capabilities (the permission strings the code checks):**
  `requests:create` · `requests:decide` (own legs) · `requests:reassign` (admin override of a stuck leg) ·
  `recert:own` · `catalog:read` · `catalog:manage` · `service_accounts:manage` · `collaborators:manage` ·
  `provisioning:manage` · `reconcile:run` · `audit:read:self` · `audit:read:all` · `governance:edit`.
- **Role → capability map (today — the single source of truth):**
  **Employee** = `requests:create`, `requests:decide` *(contextual)*, `recert:own`, `catalog:read`,
  `audit:read:self`. **Admin** = **all** capabilities. An **`IT Operator`** role is **reserved in the model**
  (= the Admin set **minus** `governance:edit`) but **not active** — activating it later is assigning that
  subset (a config change), nothing more.
- **How it's gated:** the existing `AuthenticatedGuard` + `@AdminOnly` *mechanism* stays, but `@AdminOnly`
  becomes **`@RequireCapability('service_accounts:manage')`** etc. — one decorator resolving the
  role→capability map in **one place**. The **UI** gates identically: a `can('collaborators:manage')` helper
  hides actions a user lacks, so **no one ever meets a 403**. Finer per-record rules (self-only requests,
  approver-is-an-assigned-leg) stay in the **workflow layer**.
- The **employee self-service** surface (request / track / approve) is first-class in the UI (the PRD's
  deferred self-service portal), not an afterthought on an admin console.

## Decisions (resolved 2026-11-19)
1. **IT vs Admin split** — **single `Admin` tier active now**, implemented via the **capability flags** above
   (not a raw boolean), with an `IT Operator` role **reserved** so splitting it later is a config change.
2. **External-collaborator approval** — **Sponsor + Security** (four-eyes) for anything beyond read-only, and
   for any production / sensitive scope. Sponsor + Leaver rules are in *External collaborators* below.
3. **Delegated approval** — **self-service delegation is deferred.** Instead an **Admin may reassign or
   override a stuck approval leg** (`requests:reassign`) **with a mandatory reason, fully audited** — covering
   "manager on 3 weeks PTO, urgent onboarding blocked" without a delegation engine (no chains, no mid-flight
   revocation edge cases; the audit records who actually clicked and on whose behalf).

Related: [`access-role-model.md`](./access-role-model.md), [`prd.md`](./prd.md),
[`app-authz-bindings.md`](./app-authz-bindings.md), [`architecture/solution-architecture.md`](./architecture/solution-architecture.md),
[`frontend-redesign.md`](./frontend-redesign.md).
