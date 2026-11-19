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
| Run Authentik reconciliation | — | — | ✅ | `@AdminOnly` |
| View the **full** audit log / exports | ◐ own actions | — | ✅ full | `@AdminOnly` for the full log |

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

- **Who may create one:** IT/Admin only (`@AdminOnly`).
- **Mandatory governance fields:** an accountable internal **sponsor** (an employee matricule), a **purpose/
  justification**, a **time-box (expiry)** after which access auto-lapses, and a **scoped entitlement** (the
  specific group(s)/app(s) — never birthright-plus).
- **Lifecycle:** request → (optional four-eyes: sponsor + Security) → provision a scoped Authentik account →
  **recertify before expiry** or **auto-disable**. Fully audited, same as service accounts.
- **Not** an HR operation, **not** employee self-service. *(Build status: designed here; not yet
  implemented — tracked as a follow-up epic on board #17.)*

## Technical enforcement — today vs target
- **Today (admin-first v1):** a binary split — `AuthenticatedGuard` (any user) + `@AdminOnly` (the
  `isAdmin`/`Platform Admins` gate), with finer rules (self-only requests, approver-is-an-assigned-leg) in
  the **workflow layer**. This already implements most of the matrix: employee self-service = open routes;
  every privileged op = `@AdminOnly`.
- **Target refinement (incremental, non-breaking):**
  1. Keep `@AdminOnly` as the privileged gate, but **name the persona in the UI** (role-aware nav + hide
     actions a user can't perform — see the frontend doc) rather than letting users hit a 403.
  2. Consider splitting a dedicated **`IT Operator`** capability from full **`Admin`** later (e.g. IT can
     onboard external collaborators + service accounts but not edit the governance config) — **only if** a
     real separation-of-duty need appears (need-first; today one `isAdmin` tier is proportionate).
  3. The **employee self-service** surface (request/track/approve) becomes first-class in the UI (the PRD's
     deferred self-service portal), not an afterthought on the admin console.

## Open decisions (resolve before/with implementation)
- **IT vs Admin split** — one `isAdmin` tier now, or introduce `IT Operator` immediately? *(Recommend: one
  tier now; split when a real SoD need appears.)*
- **External-collaborator four-eyes** — sponsor-approval only, or sponsor **+** Security (like service
  accounts)? *(Recommend: sponsor + Security for anything beyond read-only.)*
- **Delegated approval** — may a manager delegate their approver legs while away? *(Defer; note as future.)*

Related: [`access-role-model.md`](./access-role-model.md), [`prd.md`](./prd.md),
[`app-authz-bindings.md`](./app-authz-bindings.md), [`architecture/solution-architecture.md`](./architecture/solution-architecture.md),
[`frontend-redesign.md`](./frontend-redesign.md).
