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
| `company` *(nullable)* | the **contractor firm** the external party belongs to — **`null` = freelance** (no firm) |
| `supplierRef` *(nullable)* | **pay-link (ADR-010)** — a READ-ONLY reference to the finance/procurement **Supplier** (or contract) record a **paid** contractor is paid against (ERPNext Buying / Procurement #31). IAM stores + surfaces it, **never writes** the finance record. `null` = unlinked (soft-flagged for paid types) |
| `sponsorMatricule` | the accountable internal **employee = the manager who requests + owns the collaborator** (the collaborator is *attached* to them) — **validated as ACTIVE in ERPNext** (not terminated/unknown) |
| `purpose` (text) | mandatory justification (audit reason) |
| `groupRefs` (text[]) | the **scoped** entitlement — specific `GROUP_<x>`, never birthright-plus |
| `status` | `requested → active → expired → disabled` (+ `flagged` when the sponsor leaves) |
| `authentikUsername` | set on provision; null until then |
| `expiresAt` (timestamptz) | the **hard expiry** — ceiling below (default 90d, max 180d) |
| `lastRecertifiedAt` | renewal stamp |
| `createdBy` | the admin who filed it |

Plus an `external_collaborator_request` (sponsor + Security four-eyes legs), identical in shape to
`service_account_request` (reuse the pattern + the four-eyes `resolveApprovers`).

### Enhancement decision — collaborator company + freelance + sponsor-as-manager (2026-11-19)
**The request (owner):** *"when IT operations create the external account, it must be **double-validated**
before it's effected — by **the manager** the collaborator will work with / who employs them onto his team,
**then the admin** — and we need the external contractor **company** he belongs to, or he may be a **freelance**."*

**The flow (already built — S026):** IT/Admin **files** the request → **double validation** (the **manager**
= the `sponsor` leg · **then the admin/Security** leg) → **both approve → provisioned** (S027). The owner's
"attached to the manager" **is** the sponsor leg; IGA terminology calls that accountable internal manager the
*sponsor*. In the **UI we label it "Manager"** so it reads the way the business thinks about it. The only new
data is `company`.

**Decision.**
- **Add a nullable `company` field** (the contractor firm). **`null`/blank = freelance** — no firm. It is
  **descriptive metadata**, not an access control (access is still the scoped `groupRefs` + the sponsor's
  accountability), so it is **optional** and does not gate provisioning. Captured in the request, shown on
  the collaborator, and recorded in the audit (`company` → `"freelance"` when absent).
- **"Attached to the manager who requests" = the existing `sponsorMatricule`.** No new field: the **sponsor
  IS that manager** — the accountable internal employee who requests + owns the collaborator and whose
  **ERPNext-Leaver auto-flags them** (the attachment is what the sentinel enforces). We only **clarify the
  semantics** (label it the *sponsoring manager* in the UI) rather than duplicate the relationship.
- **Migration is additive + back-compatible** (`ADD COLUMN company` nullable → existing rows are freelance),
  so it needs no data backfill and carries no schema-drift risk.

*Rationale:* keeps the identity record honest about *who the external party is and where they're from*
(firm vs freelance) for audit/DORA third-party context, without inventing a second owner relationship or
making company a hard requirement that blocks a legitimate freelance engagement.

### Enhancement decision — pay-link to the finance Supplier record (ADR-010, built 2026-11-19)
**The request (owner):** *"when creating an external user of the IAM platform, does it also go to the RH
system, because they need to be paid? A service/technical account does not need to go to the RH system."*

**The answer + decision (see [ADR-010](./architecture/adr/000-index.md#adr-010)).** A **paid contractor is
NOT an HR Employee** (no payroll, no HR Joiner lifecycle) — they are a **Supplier/vendor paid via Accounts
Payable / Buying** (ERPNext Buying + the **Procurement & Contract Management** domain, board #31). A
**service/technical account is non-human and never paid** → correctly no finance record. IAM stays
**access-only** and, per ADR-009, **never writes back to ERPNext**. So we **link, not write**:
- **Added a nullable `supplierRef`** on `external_collaborator` = the ERPNext **Supplier ID** (or procurement
  **contract** ref) — the read-only link *access identity → paid-contractor record*. IAM **references it,
  never creates it**. Captured in the request, shown on the collaborator, recorded in the audit.
- **Soft-gate by engagement type (not a hard block):** the **paid** types (`contractor`/`broker`/`partner`)
  **prompt** for the pay-link and the console **flags "⚠ no payment record"** when it's absent; an **unpaid**
  party (e.g. a regulator-appointed `auditor`) may legitimately omit it. Access governance must not be held
  hostage to a finance step — the gap is **visible + audited**, not silent, and not blocking.
- **Handshake is phased:** *now* — procurement creates the Supplier (its system of record) → IT/manager enters
  the `supplierRef`; IAM stores + surfaces it. *Later (domain #31)* — live-validate the ref against ERPNext
  (read-only) and/or emit an "external-collaborator onboarded" event procurement consumes to open a Supplier/
  contract. **IAM never writes the finance record** (ADR-009 holds).
- **Migration is additive + back-compatible** (`ADD COLUMN supplier_ref` nullable → existing rows unlinked).

*Rejected:* IAM creating the ERPNext Supplier (couples IAM to finance, breaks the ADR-009 boundary); no link
at all (leaves paid access untraceable to the payment record); treating the contractor as an HR Employee
(wrong lifecycle). *Build:* entity + migration `1727001500000` + DTO/service/controller/workflow + audit +
UI field & paid-type flag.

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
