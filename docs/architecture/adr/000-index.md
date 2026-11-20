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
| [009](#adr-009) | **External collaborators** (IGA-07): governed human non-employee identities — sponsor + Security four-eyes, hard expiry, sponsor-Leaver safety net | **Accepted** | SA/SEC |
| [010](#adr-010) | ~~**Collaborator ↔ procurement pay-link** (supplier_ref)~~ — **Superseded by [012](#adr-012)**: the person is a *worker*, not a supplier | **Superseded** | SA/TL |
| [011](#adr-011) | **Event→n8n integration seam** (IAM emits `onboarded`; n8n writes the downstream system; IAM never calls it directly) — **target corrected by [012](#adr-012)** from ERPNext *Supplier* to ERPNext *non-payroll HR worker* | **Revised → 012** | SA/TL |
| [012](#adr-012) | **Workforce engagement model**: ERPNext HR = SoR for engagement types (CDI/CDD/Alternance/Stage + **Prestataire/Freelance = non-payroll**) + grade (cadre/non-cadre) + salary + start/end dates; **external collaborators become non-payroll HR workers**; IAM mirrors engagement-type + dates and ties access-expiry to the engagement end | **Proposed** | SA/TL |
| [013](#adr-013) | **n8n integration is webhook-driven (not NATS)**: n8n is webhook-native (no JetStream consumer), so IAM **also POSTs the signed onboarded event to an n8n Webhook** (the existing ERPNext→n8n pattern), keeping the NATS publish as a durable log; n8n binds back via a **service-key-guarded** writeback endpoint | **Proposed** | SA/TL |
| [014](#adr-014) | **Internal-employee engagement mirroring + contract-end access-expiry**: mirror `employment_type` + `contract_end_date` into the IAM identity; a fixed-term engagement (CDD/Alternance/Stage) ties its **access-expiry to the contract end** by **reusing the existing leaver sweep** (scheduled revocation), not a new sentinel. **BUILT + LIVE on dev+prod (2026-11-20)** — IAM mirror + catch-up revoke + extended sweep (ktayl-iam #124) + ERPNext producer emit (minicloud-erpnext #29); end-to-end prod QA green. | **Accepted · built · live** | SA/TL |
| [015](#adr-015) | **Workplace birthright for external collaborators**: an external collaborator, at provision time, gets the **same workplace tier as an employee** — added to the birthright `Workplace Users` group + a company mailbox (`firstname.lastname@devandre.sbs`) — while **business/LOB apps stay request→dual-approval**. Relaxes the ADR-009 "never birthright-plus" rule for the *workplace* tier only; least-privilege is preserved at the **data** tier. Time-boxed by the external's hard expiry (ADR-009/012). **n8n unchanged (ERPNext worker only); mailbox+group = IAM-direct.** **BUILT + LIVE dev+prod (ktayl-iam #126).** | **Accepted · built · live** | SA/SEC |

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
moves); using them as keys corrupts joins + audit over time. A regulated European insurer keys on an
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

## ADR-009 — External collaborators: governed human non-employee identities (IGA-07) {#adr-009}
**Context.** Some humans who need platform access are **not employees** — contractors, brokers, external
auditors, partners. They are **not in ERPNext** (not on payroll), so they cannot arrive via the HR
Joiner/Mover/Leaver flow, and an ordinary employee must not be able to mint one. Left ungoverned they are the
classic **orphaned-access** vector (access that outlives the engagement, no lifecycle owner). This is the
**architecture + security review gate** for the IGA-07 epic ([spec](../../external-collaborator-onboarding.md)).

**Decision (SA + SEC, accepted 2026-11-19).** Build external-collaborator onboarding as an **IT/Admin-only**
capability (`collaborators:manage`) **inside the IAM console**, as a close **adaptation of the IGA-06 service
account** (governed identity → four-eyes → provision to Authentik → recertify), with the human/non-employee
rules layered on:
- **Sponsor = an active ERPNext employee** (validated live; terminated/unknown rejected) — the accountable human.
- **Sponsor + Security four-eyes** beyond read-only / for any production/sensitive scope (Security guards
  scope + expiry duration; the sponsor optimises for speed).
- **Hard expiry** (default ~90d, max ~180d) + **mandatory renewal** (re-approval) → **auto-suspend on expiry**.
- **Sponsor-Leaver safety net** — an ERPNext Leaver event for a sponsor **auto-flags/suspends** their
  collaborators (hooks the existing JML consumer).
- **Scoped entitlement only** (specific `GROUP_<x>`, never birthright-plus); **IAM-only identity** — the
  console **never writes back to ERPNext** (no workforce record).
- Capability-gated (`@RequireCapability`), every action append-only **audited**, actor from the session.

**Security review (SEC).** Threats + mitigations: **orphaned access** → hard expiry + sponsor-Leaver flag;
**over-provisioning** → the Security leg + scoped-only entitlement; **external-party PII** (name/email) →
minimal fields, audited access, treated as a P-class data surface; **privileged minting** → IT/Admin-only +
four-eyes, never employee self-service. Human login provisioning uses an **Authentik invitation** (not a
Vault machine token). **No new trust boundary beyond the existing Authentik-write path** the platform already
holds. **Verdict: approved to build.** *(Solo determination — the owner acts as SA + SEC; recorded here as the
gate evidence, same discipline as the platform's accepted-risk determinations.)*

**Rejected alternatives.** (a) *Model collaborators as ERPNext employees* — pollutes the workforce
system-of-record with non-staff + would route them through payroll/JML (wrong lifecycle). (b) *Provision them
directly in Authentik by hand* — no governance, no expiry, no audit, no four-eyes (the exact gap this closes).
(c) *A greenfield module* — rejected: it is 80% the IGA-06 shape; reuse the `service_account*` code.

**Consequences.** Closes a real orphaned-access risk with an auditable, time-boxed control (DORA/ISO access
evidence). Reuses the IGA-06 entity/request/four-eyes/provision/recertify code → fast to build. Adds a human
**invitation** provisioning path + a **scheduled expiry sweep** + a JML-Leaver hook. Build = stories
S025–S030 (epic #99) on board #17.

## ADR-010 — Collaborator ↔ procurement pay-link (a paid contractor's finance record) {#adr-010}
**Status: ACCEPTED (owner-approved + built) · 2026-11-19.**

**Context.** IGA-07 (ADR-009) provisions an external collaborator's **access** (Authentik identity + scoped
groups). But a **paid contractor also has to be paid** — which needs a **finance record**. Two precisions
surfaced in review: (1) a contractor is **not** an HR *Employee* (no payroll) — they're a **Supplier/vendor**
paid via **Accounts Payable / Buying** (ERPNext Buying + the **Procurement & Contract Management** domain,
board #31); (2) IAM is **access-only** and, per ADR-009, **never writes back to ERPNext**. So IGA-07 as built
gives access but leaves the access **untraceable to the paid-contractor record** — a real gap for real use.
Service/technical accounts are **out of scope** (non-human, never paid — correctly no finance record).

**Decision (proposed).** Keep the two concerns separate, owned by their systems, and **link** them — IAM never
creates the finance record:
- **IAM owns ACCESS** (unchanged). **Procurement/Finance owns the VENDOR/CONTRACT/PAYMENT** (the **Supplier**
  + contract + invoices) in **ERPNext Buying / domain #31**.
- Add an **optional, read-only `supplierRef`** on `external_collaborator` = the ERPNext **Supplier ID** (or the
  procurement **contract** reference) — the link from *access identity* → *paid-contractor record*.
- **Prompt + soft-gate by engagement type:** for **paid** types (`contractor`/`broker`/`partner`) the UI
  **prompts** for the pay-link and **flags "⚠ no payment record linked"** when absent; a genuinely **unpaid**
  external party (e.g. a regulator-appointed auditor we don't pay) may omit it. It is **not** a hard block —
  access governance must not be hostage to a finance step — but the gap is **visible + audited**, not silent.
- **Handshake (phased):** *now* — procurement creates the Supplier (its system of record) → the manager/IT
  enters the `supplierRef` on the IAM request; IAM **stores + surfaces** it (traceability). *Later (domain #31)*
  — live-validate the ref against ERPNext (read-only) and/or emit an "external-collaborator onboarded" event
  that procurement consumes to open a Supplier/contract. **IAM still never writes the finance record** (ADR-009 holds).

**Rejected.** (a) *IAM creates the ERPNext Supplier on collaborator creation* — couples IAM to finance, makes
it a source of truth for vendors/contracts it doesn't own, and breaks the ADR-009 "never writes back to ERPNext"
boundary. (b) *No link at all* — leaves paid access untraceable to the payment record (the gap this closes).
(c) *Treat the contractor as an HR Employee* — wrong lifecycle (payroll/JML) for a non-employee.

**Consequences.** Access ↔ payment is **traceable + auditable** without coupling IAM to finance; the full
Supplier/contract automation is a **Procurement (#31)** deliverable, not an IAM one; near-term IAM carries a
reference + a soft "missing pay-link" flag. Build (if accepted): add `supplier_ref` (nullable) + migration;
plumb through DTO/service/controller/workflow + audit; UI field ("Supplier / contract ref — required to pay a
contractor") + the paid-type flag. Then QA + promote the complete flow together. *The cross-system automation
(verify/create the ERPNext Supplier, write the ref back) is **ADR-011**.*

## ADR-011 — Pay-link ↔ ERPNext integration via n8n (event-driven; IAM stays access-only) {#adr-011}
**Status: PROPOSED (for owner review) · 2026-11-19.**

**Context.** ADR-010 shipped the read-only `supplierRef` pay-link but **deferred the actual ERPNext integration**
(validate the ref / create the Supplier / write it back) as a Procurement (#31) follow-up. #31 doesn't exist yet
(`ktayl-procurement` is unbuilt). The naive next step — an **ERPNext REST client inside the IAM NestJS backend** —
would couple the governance platform to finance (an ERPNext credential + egress + SDK living *in IAM*) and erode
the **ADR-009 "IAM never writes ERPNext"** boundary. But the integration *capability* already exists on the
platform: **n8n** (ns `automation`), **ERPNext Buying** (ns `erp`, `/api/resource/Supplier`), and **IAM already
speaks NATS JetStream** (it consumes `hr.lifecycle.>` via `HrLifecycleConsumer`; the `nats` client + connection
pattern are in place).

**Decision.** Do the integration **event-driven, with n8n as the integration layer** — *compose, don't build a
new service, and don't couple IAM to ERPNext*:
1. **IAM emits a domain event** `iam.external_collaborator.onboarded` to NATS JetStream when a **paid** collaborator
   is provisioned (reusing IAM's existing NATS connection — a tiny publisher, not a new dependency). Payload:
   collaborator id/name, type, company, sponsor matricule, and the existing `supplierRef` (nullable).
2. **n8n consumes** the event and orchestrates ERPNext over its REST API:
   - `supplierRef` **present** → GET the Supplier → verify it exists; notify IT/procurement on mismatch.
   - `supplierRef` **absent** (paid type) → create a **draft Supplier** in ERPNext Buying (name from company/
     displayName, a `contractor`/`freelance` supplier group) → then **write the new Supplier ID back to IAM**.
3. **IAM is never the ERPNext caller.** The only writer to ERPNext is **n8n**. IAM only writes its **own**
   `supplierRef` field, via a narrow `PATCH /collaborators/:id/supplier-ref` endpoint that n8n calls (a scoped
   service principal). **ADR-009 holds** — IAM writes IAM; n8n writes ERPNext.
4. Human notifications (IT / procurement) via n8n (Matrix / email).

**Why n8n, now (not code-in-IAM, not wait-for-#31).** The "no procurement consumer" objection **dissolves**:
**n8n + ERPNext Buying *is* the procurement capability** for now (the same compose-don't-build move as the API-
management decision). IAM's contract is a **stable domain event** → the n8n workflow can later be replaced by a
governed **ktayl-integration (#25)** flow or a real **Procurement (#31)** service **without touching IAM**. The
mapping is visible/low-code (no code deploy to change a field map), and emitting one JetStream event is idiomatic
for IAM.

**Rejected.** (a) *ERPNext REST client inside the IAM backend* — couples IAM to finance, erodes ADR-009, puts a
finance credential + egress in the governance platform. (b) *Wait for Procurement #31* — leaves the pay-link
inert indefinitely; n8n delivers the value now at low cost. (c) *Synchronous validation on the request path* —
makes IAM's request path depend on ERPNext uptime; the **async event + soft flag** is more resilient (the flag
already covers the "unlinked" state).

**Consequences.** IAM gains (i) a small event **publisher** on provision and (ii) a narrow **`supplier-ref`
writeback** endpoint (writes only its own field, audited). The integration logic lives in a **versioned n8n
workflow** (export the JSON to the repo). ERPNext needs an API token (Vault → n8n credential) + Supplier-create
perms; an **egress netpol `automation → erp`**. The **event is the stable seam**; the boundary stays clean:
**access (IAM) → integration (n8n) → finance SoR (ERPNext Buying)**. **Revisit trigger:** fold the n8n workflow
into ktayl-integration #25 / procurement #31 when either matures (IAM unchanged — it only emits the event).

**Build slices (on approval).**
1. IAM — publish `iam.external_collaborator.onboarded` on provision (paid type) + unit test.
2. IAM — `PATCH /collaborators/:id/supplier-ref` (scoped n8n service principal) + audit + test.
3. n8n — workflow: NATS trigger → branch (verify | create Supplier) → ERPNext REST → writeback → notify; export
   JSON to `ktayl-iam/integration/n8n/`.
4. Platform — ERPNext API token → Vault → n8n credential; egress netpol `automation → erp`.
5. QA on dev — emit a test event → Supplier created in ERPNext → ref written back → the "⚠ no payment record" flag
   clears live. Then promote.

> **Status note (2026-11-19): ADR-011's *target* is corrected by ADR-012** — the event→n8n seam is kept, but it
> writes a **non-payroll HR worker** in ERPNext, not a Supplier. The person is a worker, not a vendor.

## ADR-012 — Workforce engagement model (ERPNext HR as SoR; externals as non-payroll workers; IAM mirrors engagement + dates) {#adr-012}
**Status: PROPOSED (for owner review) · 2026-11-19.** Revises **ADR-009** (externals now *do* get a workforce
record), supersedes **ADR-010** (`supplier_ref` on the person is wrong), corrects **ADR-011**'s target.

**Context.** Onboarding an external collaborator raised "do they go to the HR system — they need to be paid?".
ADR-010/011 answered with a *finance Supplier* link, which **mis-modelled the person as a vendor**. The owner
corrected it: an external collaborator is a **worker** who happens to be employed by **another firm (an ESN)**
or is **freelance** — not a supplier, and not our payroll employee either. Two facts settle the design:
- **"Paid" ≠ "salary".** A salary is what an *employer pays an employee* (with social charges). A prestataire is
  **not our employee** → what we pay is an **invoice** (the ESN's, or the freelance's own), via **Accounts
  Payable at the *firm* level** — never payroll. Putting them on payroll would be *salariat déguisé* (illegal).
- **Engagement type, grade, salary and work dates are HR master data → ERPNext HR is the SoR**, not IAM. IAM's
  `identity` is explicitly "IAM's own identity mirror; ERPNext stays the HR system of record." Today that mirror
  holds only `offboard_date` — **no start date and no engagement type** (the gap the owner spotted).

**Live state (grounded, 2026-11-19).** ERPNext HR has Employment Types **CDI · CDD · Alternance · Stage** but
**no Prestataire/Freelance**; **cadre/non-cadre is not modelled** (designations are job titles); `relieving_date`/
`contract_end_date` are unpopulated; 4 of 5 seed employees have a **NULL** `employment_type`; external
collaborators exist **only in IAM**. Payroll is wired for CDI (`CDI Temps Plein Assurance`); the
`mock-net-entreprises` service shows social-declaration is already in scope.

**Decision.**
1. **ERPNext HR = system of record** for engagement type, **grade (cadre/non-cadre)**, salary (employees only),
   and **start/end dates**. IAM consumes a projection; it never owns this.
2. **Engagement taxonomy** (one model, payroll flag is intrinsic):
   | Engagement | Our employee? | Paid via | Payroll? | End date |
   |---|---|---|---|---|
   | **CDI** (cadre/non-cadre) | yes | salary | ✅ | none (open-ended) |
   | **CDD** | yes | salary | ✅ | fixed |
   | **Alternance** (apprenti/pro) | yes | salary (special) | ✅ | fixed |
   | **Stage** | no (student) | *gratification* | ⚠️ not true payroll | fixed |
   | **Prestataire** (ESN) | **no** | **ESN invoice (AP)** | ❌ | mission |
   | **Freelance** | **no** | **own invoice (AP)** | ❌ | mission |
   → add **Prestataire** + **Freelance** as ERPNext Employment Types; "non-payroll" is enforced by **assigning no
   Salary Structure** (so they can never enter a payroll run), not by the label.
3. **cadre/non-cadre = native ERPNext `Employee Grade`** (`Cadre`/`Non-cadre`), not a custom field — it's a
   *statut* inside CDI/CDD, orthogonal to the engagement type.
4. **Dates:** `date_of_joining` (start — everyone), `contract_end_date` (fixed-term + externals), `relieving_date`
   (actual departure). CDI has no contract end. These are the HR truth; **IAM's access-expiry is derived from the
   engagement end**, not invented.
5. **External collaborators (IGA-07) become non-payroll HR workers in ERPNext** — settling the B1/B2 fork at **B2,
   owned by HR**. They are created via **IAM's `iam.external_collaborator.onboarded` event → n8n** (ADR-011's seam,
   **retargeted from Supplier to a non-payroll Employee**: `employment_type = Prestataire|Freelance`, no salary
   structure, `contract_end_date = mission end`, their firm in `company`). **IAM never writes ERPNext directly**
   (ADR-009 boundary holds — n8n is the writer); IAM stores the returned **HR worker ref** (replacing
   `supplier_ref`). Their **pay stays a firm-level invoice** (Buying/AP), not IAM's and not payroll's concern.
6. **IAM mirror + event extension:** the `hr.lifecycle` event and the `identity` mirror carry **engagement_type +
   start_date + end_date**; **access-expiry = engagement end-date** (a CDD/Stage/Prestataire's access dies with the
   mission; a CDI's doesn't).

**Rejected.** (a) *`supplier_ref` on the person* — the collaborator is a worker, not a vendor (the ADR-010 error).
(b) *Model engagement types / salary / dates in IAM* — ERPNext HR is the SoR; IAM mirroring HR master data would
split the truth. (c) *cadre/non-cadre as a custom field* — `Employee Grade` is native. (d) *Put externals on
payroll to "pay" them* — illegal disguised employment; their pay is an invoice.

**Consequences.**
- **ERPNext HR (#8):** add `Prestataire`+`Freelance` Employment Types; add `Cadre`/`Non-cadre` Employee Grades;
  backfill `employment_type` on the 4 NULL seed employees; start using `contract_end_date`/`relieving_date`. No
  Salary Structure for the non-payroll types.
- **IAM (#17):** **drop `supplier_ref`** (shipped in ADR-010, nullable + unused) → add `hr_worker_ref` +
  `engagement_type` + `start_date`/`end_date`; extend the `hr.lifecycle` event contract + the `identity` mirror;
  derive access-expiry from the engagement end; **revise the external-collaborator UI** (remove the "⚠ no payment
  record"/supplier field; show firm + engagement + dates). Retarget the (unbuilt) n8n workflow Supplier→HR worker.
- **Boundary stays clean:** **HR SoR (ERPNext) → access (IAM) → money (Buying/AP at the firm level)**; IAM emits
  events, n8n is the only ERPNext writer. **Revisit trigger:** fold the n8n workflow into ktayl-integration #25 /
  a real HR-onboarding flow when it matures — IAM only emits the event.

**Build sequence (on approval — document-first, nothing built yet).**
1. **ERPNext HR config (#8):** Employment Types (+Prestataire/Freelance), Employee Grades (Cadre/Non-cadre), seed
   backfill, date fields — a reviewable data/config change.
2. **Event contract:** extend `hr.lifecycle` (+ the IAM `onboarded` event) with engagement_type + start + end.
3. **IAM (#17):** migrate `supplier_ref`→`hr_worker_ref` (+ engagement_type/start/end on identity+collaborator);
   expiry = engagement end; UI revision; tests.
4. **n8n:** workflow IAM event → create non-payroll ERPNext worker → write `hr_worker_ref` back → notify; Vault
   ERPNext token + egress netpol `automation → erp`.
5. **QA on dev → promote** the corrected flow (replacing the supplier_ref prod change).

## ADR-013 — n8n integration is webhook-driven; bind-back is service-key-guarded (Step 4) {#adr-013}
**Status: PROPOSED (for owner review) · 2026-11-19.** Refines ADR-012 Step 4 (how the `onboarded` event
reaches n8n and how n8n writes the `hr_worker_ref` back).

**Context.** ADR-012 emits `iam.external_collaborator.onboarded` to JetStream (`IAM_EVENTS`, live in prod) for
n8n to create the non-payroll ERPNext worker. Discovery (2026-11-19) found **n8n cannot consume NATS**: zero
community nodes installed, n8n core has no JetStream trigger — it is **webhook-native**, and the only existing
integration is `allow-erp-to-n8n-webhook` (**ERPNext already drives n8n by HTTP webhook**). So the JetStream
event has no n8n consumer.

**Decision.**
1. **Transport = webhook (owner-chosen).** IAM **also POSTs** the signed `onboarded` event to an **n8n Webhook**
   node (`N8N_ONBOARD_WEBHOOK_URL`, config-gated → no-op if blank), mirroring the ERPNext→n8n pattern. The
   **NATS publish is kept** as a durable event log / future-consumer seam (not removed). The POST is **HMAC-signed**
   (`IAM-Signature`, same key as the NATS event) so n8n verifies authenticity. Best-effort — a webhook failure
   never fails provisioning.
2. **Bind-back auth = service key.** n8n writes the id back via `POST /collaborators/:id/hr-worker-ref`, which is
   `@AdminOnly` (OIDC session) — a machine can't hold a session. Add a **`ServiceKeyGuard`**: the route is
   `@Public()` + guarded by a constant-time check of the `X-IAM-Service-Key` header against `IAM_SERVICE_KEY`
   (Vault→ESO). **Fail-closed** — blank key denies all, so the endpoint is inert until the secret is wired.
   (`AdminGuard` is taught to skip `@Public` routes.) *Upgrade path:* swap for Authentik M2M client-credentials
   + JWKS (the platform standard) when more machine callers appear — accepted simplification for one internal
   endpoint now.
3. **n8n workflow:** Webhook (verify `IAM-Signature`) → upsert ERPNext `Employee` (`employment_type` from firm:
   set→Prestataire, blank→Freelance; **no Salary Structure**; `custom_agency_or_firm`=firm; `contract_end_date`=
   endDate) keyed on `idempotencyKey`/email → `POST …/hr-worker-ref` with `X-IAM-Service-Key` → notify. Committed
   as a versioned artifact in `integration/n8n/`.

**Rejected.** (a) *NATS→webhook bridge* — a new component to run for one event. (b) *n8n community NATS node* —
an unofficial dependency to trust/maintain + changes the n8n image. (c) *Authentik M2M for the writeback now* —
heavier than warranted for one internal endpoint (IAM auth is session-based, no bearer/JWKS path yet).

**Consequences.** IAM gains a small signed webhook-emit + a fail-closed service-key guard (both config-gated →
safe to ship before secrets exist). Platform/owner wiring (Step 4 handoff): an **ERPNext API token** (service
user) → Vault; the **`IAM_SERVICE_KEY`** + **n8n webhook URL** → Vault/ESO + n8n; **egress netpols**
`automation→erp` and `automation→ktayl-iam(-prod)`; **import + activate** the n8n workflow. Boundary unchanged:
**IAM emits + accepts its own field; n8n is the only ERPNext writer** (ADR-009).

### ADR-013b — prod enablement (dev/prod routing) + workflow hardening (2026-11-20)
The dev loop is live + QA-verified; three items close the gap to a prod-grade integration:
1. **Dev/prod routing via `iamCallbackBaseUrl` on the event.** ONE n8n workflow serves both envs (one n8n), so
   the event must say **which IAM to bind back to** — else a dev-originated onboard would bind into prod IAM (or
   vice-versa). IAM stamps **`iamCallbackBaseUrl`** (its own env's base URL, config `IAM_CALLBACK_BASE_URL`: dev
   `https://iam-dev.10.0.0.200.nip.io`, prod `https://iam.10.0.0.200.nip.io`) into the event; the n8n bind-back
   uses it instead of a hard-coded host. Then **prod IAM also gets `N8N_ONBOARD_WEBHOOK_URL`** (emit enabled) +
   a netpol `ktayl-iam-prod → n8n`. `IAM_SERVICE_KEY` is already on both envs (shared ESO).
2. **Idempotency (GET-first).** The event may fire twice (retry / at-least-once). The workflow **looks up the
   worker by `custom_iam_collaborator_id` first** (ERPNext REST filter, URL-encoded inline) and reuses it; only
   creates if absent → re-firing is a no-op, and the unique constraint is a backstop, not the happy path.
3. **HMAC verification.** The webhook enables **raw body**; the Code node recomputes
   `HMAC-SHA256(rawBody, HR_LIFECYCLE_SIGNING_KEY)` and compares it to the **`IAM-Signature`** header (defence-in-
   depth atop the netpol caller restriction); a mismatch stops the run. Then `JSON.parse` the raw body for the
   fields. (n8n already has `NODE_FUNCTION_ALLOW_BUILTIN=crypto` + `HR_LIFECYCLE_SIGNING_KEY` in env.)

These are additive + config-gated on the IAM side (dev stays working; prod enables when its env is set). Build
+ QA on dev first, then promote the IAM code to prod and flip prod's webhook URL on.

### Refinements incorporated (owner review, 2026-11-19)

**R0 — The directory hop is via Authentik, NOT ERPNext→IAM directly (topology correction).** IAM does **not**
read users from ERPNext. **Authentik is the central directory** ("our Entra", ADR-001); IAM's user search is
`GET /directory/users` → `AuthentikClient.listUsers()` → Authentik `/core/users/`. So the real chain is:
```
ERPNext HR (HR SoR) ──▶ Authentik (directory) ◀──listUsers / search── IAM ──groups──▶ Authentik (enforcement)
                                                                     │
  money ─▶ Buying / AP (firm-level invoice)        n8n writes ERPNext ◀┘ (externals only; IAM never writes ERPNext)
```
Consequence: **engagement_type + start/end + grade travel ERPNext → Authentik (as user attributes) and/or the
`hr.lifecycle` event → IAM**; IAM reads the directory from **Authentik**, and its `identity` row stays a *mirror*.
The ADR-012 diagram's "ERPNext ──▶ IAM" arrow is replaced by "ERPNext ──▶ Authentik ──▶ IAM(reads)".

**R1 — Two birth-places, one loop-safe contract (SoR vs intake).** State *why* both arrows exist so no one wires
an infinite event loop:
- **Internal (CDI/CDD/Alternance/Stage):** **born in ERPNext HR** → provisioned into **Authentik** → `hr.lifecycle`
  confirms/mirrors into IAM. IAM never writes these back to ERPNext.
- **External (Prestataire/Freelance):** **born in IAM** (collaborator intake) → IAM provisions the **Authentik**
  user + emits `iam.external_collaborator.onboarded` → **n8n creates the ERPNext `Employee`** (non-payroll) →
  ERPNext assigns the canonical **`hr_worker_ref` (`HR-EMP-xxxxx`)** and emits `hr.lifecycle` **back** to IAM to
  **bind the mirror** (confirm, not re-create).
- **Loop guard (mandatory):** every n8n→ERPNext write carries an **idempotency key** (`iam_request_id`, fallback
  `email`); the resulting external-origin `hr.lifecycle` event is recognised by that key as a **bind**, so IAM
  does **not** re-provision/re-trigger. ERPNext upserts on the key (no duplicate Employee).

**R2 — `Stage` is NON-payroll in ERPNext (decided now).** *Gratification de stage* needs a *bulletin* + DSN only
above the statutory ceiling; building that in ERPNext means a lightweight Salary Structure + DSN wiring. For now
(no real interns, DSN is `mock-net-entreprises`) **Stage carries no Salary Structure → excluded from Payroll
Entry**, exactly like Prestataire; gratification, if ever real, is handled by the external accountant.
**Revisit trigger:** a real intern + real DSN → build the Stage gratification structure then (need-first). So
payroll-eligible = **CDI · CDD · Alternance** only; **Stage · Prestataire · Freelance = no Salary Structure**.

**R3 — Renewal/extension is a first-class event (no re-provision churn).** ESN missions + freelance contracts get
**extended** every 3–6 months. The `hr.lifecycle` contract gains an **`engagement.updated`** (extension) event
that **updates `contract_end_date` in ERPNext and pushes the new access-expiry to IAM in place** — IAM extends
`expiresAt` **without** a deprovision→reprovision cycle (the access identity + groups are untouched; only the
expiry moves). A true end (no extension) still runs the normal expiry/leaver path.

**R4 — Verdicts on the two open questions.**
- **Keep externals in the ERPNext `Employee` master — no custom DocType.** `Employee` is already wired to Projects/
  Timesheets/Expense Claims/Attendance/org-chart + user-linking + lifecycle hooks; `Employment Type` with **no
  Salary Structure Assignment** cleanly excludes them from payroll while keeping those native integrations. A
  custom DocType would rebuild permissions/linking/hooks from scratch.
- **`Cadre`/`Non-cadre` = native `Employee Grade`, scoped to internal employees only.** It governs *forfait jours*,
  *préavis*, prévoyance brackets — idiomatic as `Employee Grade`. **HR validation leaves `grade` NULL for
  Prestataire/Freelance/Stage** so statutory headcount/cadre reports aren't polluted.

**R5 — Firm visibility without conflating entities.** Add a custom field **`custom_agency_or_firm`** on `Employee`
(**Data**, or an optional **Link to the AP `Supplier`** for the ESN — read-only/informational) so HR/IT see which
ESN a `Prestataire` belongs to **without** making the person a Supplier. The `company` field on the IAM
collaborator maps to this.

### Step-1 execution list (ERPNext HR config — reviewable, no code)
- `Employment Type`: **+ `Prestataire`, + `Freelance`** (CDI/CDD/Alternance/Stage already exist).
- `Employee Grade`: **+ `Cadre`, + `Non-cadre`** (internal-only; NULL for Prestataire/Freelance/Stage).
- `Employee` custom field **`custom_agency_or_firm`** (Data or Link→Supplier, read-only/informational).
- **Backfill** the 4 seed employees' NULL `employment_type`; verify `contract_end_date`/`relieving_date` behaviour.
- Confirm **no Salary Structure** is attached to Stage/Prestataire/Freelance (payroll-excluded).

## ADR-014 — Internal-employee engagement mirroring + contract-end access-expiry {#adr-014}
**Status: ACCEPTED · BUILT · LIVE on dev + prod · 2026-11-20.** The symmetric internal-employee half
of ADR-012: external collaborators tie access to their engagement end; internal **fixed-term** employees now
do too. *(Originally accepted-design/build-deferred; the owner elected to build it immediately rather than wait
for the first fixed-term hire — the feature is additive + inert where there is no data, so shipping early carries
no risk and removes the dependency later.)*

**Context.** ADR-012 made ERPNext HR the SoR for engagement types incl. **CDI / CDD / Alternance / Stage**. A
fixed-term contract (CDD/Alternance/Stage) has a **`contract_end_date`**; a **CDI** is open-ended. Today IAM's
`identity` mirror carries only `offboard_date` (the relieving date, set by a **Leaver** event) and a **daily
sweep auto-revokes** any identity whose offboard date has passed (S017 — with a "revoke the day-after /
catch-up-if-backdated" rule). So a fixed-term employee's access is only time-boxed **if** HR fires a Leaver
event on time — there is no proactive cap at the contract end.

**Decision (design).** Tie a fixed-term engagement's access-expiry to its contract end **by reusing the existing
leaver sweep**, not by adding a second sentinel:
1. **Mirror `employment_type` + `contract_end_date`** onto the `identity` (additive migration; the `hr.lifecycle`
   event gains two **optional, back-compatible** fields — absent ⇒ today's behaviour unchanged).
2. For a **fixed-term** engagement (`CDD`/`Alternance`/`Stage`) with a `contract_end_date`, set the identity's
   **scheduled revocation = `contract_end_date`** (the existing sweep then revokes at contract end). **CDI** has
   no end ⇒ no scheduled expiry. A **renewal** (mover/updated event with a new `contract_end_date`) just **moves
   the scheduled date** — a still-employed person is never cut off. A real **Leaver** (earlier relieving) still
   wins. One revocation path (DRY), consistent with the Leaver + external-collaborator models.
3. **Enabling dependency:** the ERPNext **`erpnext_hr_lifecycle`** producer must **emit** `employment_type` +
   `contract_end_date` on joiner/mover events (a Frappe-app change) — the IAM side is inert until it does.

**Rejected.** (a) *A new "contract-end" sentinel* — duplicates the leaver sweep; DRY-reuse is cleaner. (b)
*Flag-for-HR-review instead of auto-revoke* — safer but a second path + access can outlive the contract until a
human acts; the auto-revoke-via-sweep (with renewals updating the date) is consistent and genuinely time-boxes
access. (Revisit at build time if a human-in-the-loop grace is wanted.) (c) *IAM owns the contract dates* —
ERPNext HR is the SoR (ADR-012); IAM mirrors.

**Consequences.** The design is coherent + additive (safe where there's no data). Even though ERPNext currently
has **zero** CDD/Alternance/Stage employees (all 5 internal are CDI, no `contract_end_date` populated), the mirror
is inert for CDI (no scheduled expiry) so shipping it early carries no risk and removes the enabling dependency for
the first fixed-term hire. **As built (2026-11-20):**
- **IAM side** — migration `1727001700000-IdentityEngagement` adds `employment_type` + `contract_end_date` to
  `identity`; the `hr.lifecycle` DTO gains the two optional fields; `onJoinerOrMover` **present-only mirrors** them
  (distinguishing absent-vs-null), with a **catch-up revoke** if the contract already ended at event time; the daily
  `processScheduledLeavers` sweep is **extended with a second query** (`active` + fixed-term + `contract_end_date`
  past) that shares `revokeAccess` with the Leaver path (DRY). 5 new unit tests (167 total green). (ktayl-iam #124.)
- **ERPNext producer** — `erpnext_hr_lifecycle.events._subject_payload` now emits `employment_type` +
  `contract_end_date` (minicloud-erpnext #29; image `v16.28.0-facturx-19391d1`, shipped via gitops #2336).
- **Live prod QA (end-to-end through the real signed producer):** a future-dated CDD mover → identity mirrors
  `CDD`/`2027-06-30`, stays `active` (no revoke); a past-dated CDD mover → `contract-end (catch-up) … revoking now`
  → `ACCESS REVOKED`, `status=left`. HMAC verified, DTO mapped, both paths exercised; disposable identity cleaned up.

## ADR-015 — Workplace birthright for external collaborators {#adr-015}
**Status: ACCEPTED · BUILT · LIVE on dev + prod · 2026-11-20 — owner-approved after a code-mapping review
(below).** *Document-first: the decision was written + approved before any code.* **As-built (ktayl-iam #126):**
a shared **`WorkplaceAccessService`** (+ `WorkplaceModule`) now owns the workplace tier for BOTH the HR Joiner
and external provisioning — cross-table email allocation (`identity` + `external_collaborator`), mailbox
provision, birthright-group grant, mailbox disable; `external_collaborator` gained `workplace_email` (unique) +
`mailbox_provisioned` (migration `1727001800000`); the sentinel suspend disables the mailbox too (leaver
parity). 12 new tests (179 green). Migration + healthy boot verified on dev + prod; the employee Joiner (which
now shares the exact same mailbox+group path) runs live, so the workplace-grant mechanics are already
prod-proven. Remaining acceptance: a full external-provision exercised against a provisioning-configured
Authentik+Stalwart (dev is not configured for it) — strongly de-risked by the shared-path proof.

**Reviewed against the live system (maps cleanly):** the mailbox routine is the injectable `StalwartClient`
(`lifecycle/stalwart.client.ts` — `createMailbox`/`disableMailbox`), reusable from the external module; the
birthright group is `cfg.workplaceGroup` (`WORKPLACE_GROUP ?? 'Workplace Users'`) added via
`authentik.addUserToGroup` — the same calls the employee Joiner makes. **n8n is unchanged** — it still only
does the **ERPNext HR-worker writeback** (ADR-012/013, the `onboarded` event); the mailbox + workplace group
are written by **IAM directly** to its own enforcement plane (Authentik + Stalwart), per the ADR-009 boundary
(*IAM writes its own plane; n8n writes downstream business systems*). Two implementation nuances surfaced by
the review are folded into the build sketch below: the **contact email vs company mailbox** split, and the
**cross-table email-uniqueness** check.

**Context.** The platform is an **M365 alternative** — the *workplace suite* (Nextcloud, OnlyOffice, Mail/
Stalwart, Matrix/Element, Jitsi, Docuseal, n8n, Homer, …) is what everyone needs just to *collaborate*;
the *business/LOB apps* (ERPNext, ktayl-core, Claims, Underwriting, GLPI, the IAM console itself, …) hold
**regulated insurance data** and are gated. Today the two populations are provisioned asymmetrically:
- **Employees (HR Joiner, S015/016):** `onJoinerOrMover` derives a company mailbox (`firstname.lastname@
  devandre.sbs`), creates the Authentik user, and adds them to the birthright **`Workplace Users`** group
  (`cfg.workplaceGroup`) → *instant access to the whole workplace suite*. Business apps come later via
  request → dual-approval (ADR-007).
- **External collaborators (IGA-07, S027):** `ExternalCollaboratorProvisioningService.provision` creates the
  Authentik user and adds **only the scoped `GROUP_<x>`** named at request time — explicitly **"never
  birthright-plus"** (ADR-009) — and provisions **no mailbox**.

So a contractor can be handed a Claims role but **cannot open Nextcloud, chat on Matrix, or join a Jitsi
call** — the very tools they need to actually work with the team. The owner's requirement: an external
collaborator should get the **same workplace tier as an employee**, while still **not** gaining any business
app automatically.

**Decision (proposed).** At external-collaborator **provision time**, in addition to the scoped business
`GROUP_<x>`:
1. **Add the external to the same birthright `Workplace Users` group** (`cfg.workplaceGroup`) — the *identical*
   binding set employees get. (Owner choice: **reuse** the one group, not a separate `External Workplace
   Users` — simplest; externality stays visible via the `external_collaborator` record + the `ext-<firm>-<user>`
   username convention, not via a distinct workplace group.)
2. **Provision a company mailbox** (`firstname.lastname@devandre.sbs`) for the external, reusing the employee
   Joiner's collision-safe email derivation + Stalwart provisioning routine. (Owner choice: **full suite incl.
   mailbox** — truly identical to an employee.)
3. **Business apps stay request→dual-approval.** The relaxation is **workplace-tier only**; least-privilege is
   preserved where it matters — the **data** tier. ADR-009's "never birthright-plus" is **amended**: it now
   means *"no birthright **business** access"*, not *"no birthright at all"*.
4. **Scope: all external collaborators** get it (no engagement-type/duration gate).
5. **Time-boxing (unchanged safety net):** the workplace grant is bounded by the external's **hard expiry**
   (ADR-009 sentinel auto-suspend + sponsor-Leaver) and, where a `contract_end_date` applies, the ADR-014
   sweep. Offboarding already **removes ALL Authentik groups** (incl. `Workplace Users`) and must now also
   **archive the external's mailbox** (the employee Leaver path already does this — extend the external
   deprovision to call it).

**Rejected / alternatives.** (a) *A separate `External Workplace Users` group* — more auditable/scopable, but
the owner chose the single shared group for simplicity (revisit if externals ever need a different workplace
session/DLP policy). (b) *No company mailbox for externals (use their ESN email)* — lower data-at-rest + more
BYOD-aligned, but the owner wants a single identical identity. (c) *Keep "never birthright-plus" and let the
sponsor name the workplace groups per-request* — toil + drift (every contractor would re-enumerate the whole
suite); birthright is exactly the right tool for "everyone gets the baseline".

**Consequences.**
- ➕ A contractor is immediately productive (collaboration tools) without a dual-approval round-trip per app.
- ➖ Externals now hold a **company mailbox** → more data-at-rest + a mandatory **leaver mailbox-archive** step
  on the external deprovision path (new work; the employee path already has it).
- ⚠️ **Mailbox naming collision:** an external `Jane Doe @ Acme` derives `jane.doe@devandre.sbs` — same as an
  employee Jane Doe. The existing `deriveUniqueEmail` is collision-safe (disambiguates), so this is handled,
  but externals' boxes are **not** visually distinguishable from staff by address (accepted, per the single-
  identity choice; revisit with an `.ext` suffix if wanted).
- 🔒 Audit: provisioning audit event gains the `Workplace Users` grant + mailbox; the `external_collaborator`
  record remains the SoR for *who is external*.
- Security posture statement for an interviewer/auditor: **"birthright = collaboration; business data = earned
  (request + four-eyes) — for staff and contractors alike."** A clean, defensible least-privilege line.

**Build sketch (approved).** Extend `ExternalCollaboratorProvisioningService.provision`: after the scoped-group
loop —
1. **Company mailbox ≠ contact email.** The entity's existing `email` is the contractor's **own contact/recovery
   address** (used for the Authentik invite) — **do not overwrite it.** Add **separate** columns
   `workplace_email` + `mailbox_provisioned` to `external_collaborator` (migration). Derive `workplace_email`
   = `firstname.lastname@<domain>` and provision it via the shared `StalwartClient.createMailbox`. The Authentik
   user's recovery still goes to the **contact** email (the external can't yet reach the new box).
2. **Cross-table uniqueness.** The employee `deriveUniqueEmail` only checks the `identity` table; an external
   `jane.doe` must not collide with an **employee** `jane.doe` **or another external**. Make the email
   allocator check **both** `identity.email` and `external_collaborator.workplace_email` (extract a small shared
   allocator, or query both) — collision-safe disambiguation.
3. **Workplace group.** `authentik.addUserToGroup(c.name, cfg.workplaceGroup)` — the same `Workplace Users`
   birthright, in addition to the scoped `GROUP_<x>` business groups (business stays request→four-eyes).
4. **Deprovision parity.** The sentinel `suspend` + the admin `disable`/offboard path today **disable the
   Authentik user** (blocks all login). Since externals now own a mailbox, **also** call
   `StalwartClient.disableMailbox(workplace_email)` — mirror the employee Leaver (`lifecycle.service` L245).
5. **Audit** payload gains the `Workplace Users` grant + the mailbox (the invite link is still never stored).

Tests: provision grants workplace + mailbox + keeps business scoped + contact-email preserved; email
uniqueness across both tables; deprovision disables the user **and** the mailbox; idempotent re-provision (no
second mailbox). Then live QA on dev + the prod-promotion QA gate. (ktayl-iam — this PR.)
