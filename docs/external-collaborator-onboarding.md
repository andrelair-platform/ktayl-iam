# External Collaborator Onboarding — backend epic (IGA-07)

> **Status: AS-BUILT · 2026-11-19.** Shipped as **IGA-07** — ADR-009 governance gate + stories **S025–S030**
> (PRs #107–#111), all merged. The design below is the as-built contract (one deviation: the sponsor-Leaver
> safety net is a **self-contained daily sentinel sweep**, not a one-shot JML hook — more robust, see S029).
> The backend capability that now powers **Phase 4** Governed by [`operation-authorization-model.md`](./operation-authorization-model.md)
> (*External collaborators*). Delivery path **B/C** (new boundary-crossing capability, identity + PII) →
> the **architecture + security governance gate applies** before build (`bmad-compliance.md`).

## What it is
A **human non-employee** who needs platform access — a contractor, broker, external auditor, partner. They
are **not in the HR system** (not on payroll), so they cannot arrive via the HR Joiner flow, and an ordinary
employee must not be able to mint one. The console is the governed home, **IT/Admin-only**
(`collaborators:manage`). Shaped like the IGA-06 service account, but for a **human** with a **sponsor** and
a **hard expiry**.

**Non-goals / boundaries:** never an HR operation, never employee self-service; the console **never writes
back to ERPNext** — an external collaborator is an **IAM-only identity with no workforce record**.

## Domain model — `external_collaborator`
| Field | Notes |
|---|---|
| `id` (uuid) | |
| `name` / `displayName` | the Authentik username to provision + the human-readable name |
| `email` | contact / invite target |
| `sponsorMatricule` | the accountable internal **employee** — **validated as ACTIVE in ERPNext** (not terminated/unknown) |
| `purpose` (text) | mandatory justification (audit reason) |
| `groupRefs` (text[]) | the **scoped** entitlement — specific `GROUP_<x>`, never birthright-plus |
| `status` | `requested → active → expired → disabled` (+ `flagged` when the sponsor leaves) |
| `authentikUsername` | set on provision; null until then |
| `expiresAt` (timestamptz) | the **hard expiry** — ceiling below (default 90d, max 180d) |
| `lastRecertifiedAt` | renewal stamp |
| `createdBy` | the admin who filed it |

Plus an `external_collaborator_request` (sponsor + Security four-eyes legs), identical in shape to
`service_account_request` (reuse the pattern + the four-eyes `resolveApprovers`).

## Lifecycle
```
requested ─(Sponsor + Security approve)→ approved ─(provision)→ active ──(renew)──┐
    │ deny → denied                                   │                           │
    │                                   expiresAt reached → expired (auto-suspend) ┘
    │                                   sponsor ERPNext-Leaver → flagged (reassign or suspend)
    └ admin disable → disabled
```

## Governance rules (from the authz model — enforce in the backend)
1. **Sponsor = active ERPNext employee** — validated live at request time (reuse the HR/manager-resolver read);
   a terminated/unknown matricule is rejected.
2. **Sponsor + Security four-eyes** for anything beyond read-only / for any production/sensitive scope.
   Security is the guardrail on **scope + expiry duration** (the sponsor optimises for speed).
3. **Expiry hard-ceiling** — default ~90 days, max ~180; **mandatory renewal** before it (renewal = re-approval),
   else **auto-suspend** (`expired` → disable the Authentik account).
4. **Sponsor-Leaver safety net** — on an ERPNext **Leaver** event for a sponsor matricule, all their active
   collaborators are **auto-flagged for reassignment or suspended** (closes the orphaned-access vector).
5. **One-directional** — never creates/updates an ERPNext record; IAM only *consumes* ERPNext.
6. Every action **audited** (append-only), actor attributed from the session.

## API (all `@RequireCapability('collaborators:manage')` except read)
`POST /collaborators/requests` · `GET /collaborators/requests` · `POST /collaborators/requests/:id/decide`
(sponsor/Security legs) · `GET /collaborators` · `POST /collaborators/:id/provision` ·
`POST /collaborators/:id/renew` · `POST /collaborators/:id/disable` · `GET /collaborators/due?days=` (expiring).

## Security / threat notes (feed the security gate)
- **Orphaned access** (collaborators outlive the engagement) → mitigated by the hard expiry + sponsor-Leaver flag.
- **Over-provisioning** → Security leg + scoped-only entitlement (no birthright).
- **Identity/PII** (name/email of an external party) → P-class data handling; minimal fields; audited access.
- **Human login provisioning** — the collaborator authenticates to Authentik; provision creates the account +
  an **invite / credential-set flow** (not a Vault machine token). Decide: Authentik invitation link vs an
  admin-set initial password (lean invitation).

## Story breakdown (IGA-07 — mirrors IGA-06; reuse the service-account code)
| Story | Scope | Key ACs |
|---|---|---|
| **S025** entity + persistence | `external_collaborator` + `_request` entities + Flyway/TypeORM migration + service | unique name; starts `requested`; audited create |
| **S026** request + Sponsor+Security four-eyes | reuse `resolveApprovers` (sponsor + Security legs); **validate sponsor is an active ERPNext employee**; mandatory purpose + expiry (ceiling-checked) | 422 missing purpose/expiry; reject inactive sponsor; both-approve → `approved`; no self-approval |
| **S027** provision to Authentik (scoped) | ensure Authentik user + scoped groups + invite/credential; set `active` + `authentikUsername` + `expiresAt`; audited | idempotent; provisions scoped groups only; retryable |
| **S028** expiry + renewal + recert | `renew` (re-approval, ≤ ceiling) + `due` query + **auto-suspend on expiry** (scheduled) | expired → Authentik disabled; renew extends; due surfaces |
| **S029** sponsor-Leaver safety net | hook the existing **JML Leaver** consumer: sponsor-leaver → flag/suspend their collaborators | leaver event → collaborators `flagged`/disabled; audited |
| **S030** Phase 4 frontend | the admin UI (spec §5.3) — list + lifecycle stepper + sponsor/expiry + renew/reassign | capability-gated; name·matricule; axe-clean |

## Delivery
- **Path B/C** — run the governance gate (SA architecture review + **SEC security review** — boundary +
  PII + identity) before build; record the ADR. Reuse **IGA-06**'s entity/request/four-eyes/provision code
  (`service_account*`) as the template — this is largely an adaptation, not a greenfield.
- Board: **#17 (Access Governance / IAM-IGA)**. Home repo: `ktayl-iam`.

Related: [`operation-authorization-model.md`](./operation-authorization-model.md),
[`frontend-redesign.md`](./frontend-redesign.md) (§5.3), the IGA-06 service-account implementation.
