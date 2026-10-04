# Sprint Plan — Access Governance v3 (JML / event-driven lifecycle) — GREENFIELD

> **BMAD artefact — SPRINT PLAN + READINESS GATE.** **Path-C-ish greenfield** on the existing
> ktayl-iam product: none of this exists today (verified 2026-10-04 — ERPNext shows 0 Leave/Expense/
> Workflow-Action records; no HR-event intake; n8n/Temporal not wired to HR). It crosses the
> **authn/authz + HR-integration boundary** → the governance gate (SEC + SA review) applies.
> **Status: DRAFT for review.** Stories sync to board **#17** on build start. Depends on **v2**
> (multi-user login) — you can't have lifecycle *approvals/recert* until non-admins can log in.

## Why this sprint — the honest gap

v1 built the **request-driven** half of access governance (request → four-eyes → provision → audit).
The **event-driven** half — the SAP-style **Joiner / Mover / Leaver** lifecycle where an **HR event**
triggers access changes — **does not exist**. v3 builds it greenfield: an HR-event intake, a
**birthright policy engine**, auto-provision on join, auto-deprovision on leave, recompute+recert on
move, and the non-access fan-out to GLPI + email. This is net-new work, **not** "wiring existing boxes."

## The governing principle (owner decision, 2026-10-04) — bake this in everywhere

> **Workspace access is BIRTHRIGHT — granted automatically the moment an employee is created, with no
> per-grant approval. Business / LOB / engineering access is ON-REQUEST — nothing business is ever
> auto-granted; it always goes through the v1 four-eyes request flow.**

- **Birthright = the digital workplace** (Nextcloud files · Stalwart mail · Matrix/Element chat · Jitsi ·
  OnlyOffice · the Homer **Company Portal** · Vaultwarden · Docuseal). A new joiner gets these on day one.
- **On-request = everything else** (Claims · Underwriting · Policy · Finance · GLPI · ArgoCD/Grafana/
  the engineering portal · …) — the joiner gets **zero** business access until they request it and both
  approvers sign off.
- **This is still governed, not ungoverned:** birthright's governance moved from *per-grant* to two
  places — (1) the **hire decision** (an approval, in HR) and (2) the **birthright-policy definition**
  (admin-owned + change-audited in the catalog). Per-grant four-eyes stays for business apps.

## Grounding (verified — why this is greenfield)

- ERPNext HR = a **directory of record** only: 5 seed employees, **0** Leave/Expense/Job-Applicant/
  Attendance records, **0 Workflow Actions** → no HR workflow has ever run; no event emitter is wired.
- ktayl-iam has the **substrate** v3 reuses — the catalog, the assignment lifecycle (`active`/`revoked`,
  `grantedBy`), the Authentik **sync engine** (grant/revoke/reconcile), and the **append-only audit** —
  but **no** HR-event intake, **no** birthright/policy engine, **no** JML orchestration.
- n8n + Temporal are deployed but **not** connected to any HR process.

## Architecture (new pieces, where they live)

```
ERPNext HR  (Employee create / update / relieve)
     │  Frappe Webhook (signed)              [D1: webhook + a poll-reconcile fallback so a missed event self-heals]
     ▼
ktayl-iam  POST /api/lifecycle/events        [NEW — S015]
     │   normalize → {joiner | mover | leaver, matricule, job, dept, country, entity}
     ▼
Birthright policy engine                     [NEW — S014/S016]
     │   compute target BIRTHRIGHT set (v3 MVP = the flat workspace profile; position-based later)
     ▼
Access delta → ktayl-iam assignment lifecycle + Authentik sync   [REUSE v1]  → append-only audit [REUSE v1]
     │   joiner: auto-grant birthright (NO four-eyes) · business stays requestable
     │   leaver: revoke ALL · mover: recompute birthright + FLAG old business grants for recert
     ▼
n8n / Temporal  (non-access fan-out)         [NEW — S019]
     ├─► GLPI: software/SaaS onboarding/offboarding tasks   (NO hardware — BYOD)
     └─► Stalwart: onboarding / offboarding email
```
**Division of labour (recommended):** ktayl-iam owns the **access** decision (birthright compute +
grant/revoke + audit); n8n/Temporal owns only the **non-access** fan-out. Access logic stays in the
access system of record.

## Key design decisions (recommendations — confirm at kickoff)

- **D1 — event transport.** *Rec:* Frappe **Webhook** on `Employee` → a signed ktayl-iam endpoint, **plus**
  a scheduled **poll-reconcile** that re-derives lifecycle state from ERPNext (so a dropped webhook
  self-heals — same philosophy as the access reconcile). Alt: NATS CDC (heavier, like claims).
- **D2 — birthright scope (MVP).** *Rec:* a **flat workspace profile** for every employee (the owner's
  rule). Position-based birthright (Country×Dept×Job → extra baseline) is a **later enrichment**, not v3 MVP.
- **D3 — birthright approval.** **None** per-grant (hire + policy are the governance). The **policy
  definition** is admin-governed + change-audited. Business apps keep **v1 four-eyes** — unchanged.
- **D4 — leaver aggressiveness.** *Rec:* **revoke ALL immediately** on the relieve event (dangling access
  is the classic audit finding) + optionally **disable the Authentik account**; keep the full audit. Alt: grace window.
- **D5 — mover old access.** *Rec:* **flag business grants for re-certification** (owner/manager review
  with a deadline) rather than silently keeping or auto-revoking — don't break someone mid-transfer.
  Birthright workspace access is unaffected by a move.
- **D6 — Authentik user creation.** Who *creates* the Authentik account for a new hire? Today matricule =
  username already exists in Authentik. *Rec:* v3 assumes the Authentik user exists (HR→Authentik user
  sync is a separate concern); the joiner flow grants **group membership**, it doesn't mint the user. Flag
  if HR→Authentik user provisioning must also be built (SCIM-style — likely a v4 item).

## Story breakdown

### S014 — Catalog: birthright vs on-request + the workspace profile  · [IGA-01 / core] · P1 · 5
Encode the governing principle in the data model.
- **AC** ✓ Application/Role gains an **`accessClass`** (`birthright` | `on-request`); ✓ a **birthright
  profile** = the set of birthright roles (the workspace apps); ✓ seed the workspace apps (Nextcloud/
  mail/chat/Jitsi/OnlyOffice/Company-Portal/Vaultwarden/Docuseal) as **birthright**, everything else
  **on-request**; ✓ admin can edit the profile (change-audited).
- **AC (fail)** ✗ a role with no `accessClass` defaults to **on-request** (safe default — never accidentally birthright); ✗ marking a **business** app birthright requires an explicit admin action + audit.
- **DoD** the catalog cleanly answers "is this access automatic or requested?"; migration + tests.

### S015 — HR-event intake (ERPNext → ktayl-iam)  · [IGA-01 / integration] · P1 · 8
The trigger. **Greenfield.**
- **AC** ✓ a Frappe **Webhook** on `Employee` (create/update/relieve) posts to a **signed**
  `POST /api/lifecycle/events`; ✓ it normalizes to `{type: joiner|mover|leaver, matricule, attrs}`;
  ✓ **idempotent** (replay-safe); ✓ a scheduled **poll-reconcile** re-derives state so a missed webhook self-heals (D1); ✓ every event audited.
- **AC (fail)** ✗ an unsigned/forged event is rejected; ✗ an unknown matricule is flagged, not crashed; ✗ events are processed in order per employee.
- **DoD** creating/relieving an employee in ERPNext produces a recorded lifecycle event in ktayl-iam.

### S016 — Joiner: auto-provision the workspace birthright (NO approval)  · [IGA-01 / core] · P1 · 8
The owner's rule, made real.
- **AC** ✓ on a **joiner** event → compute the birthright (workspace) set → **auto-grant** assignments
  (`grantedBy=system:joiner`, **no four-eyes**) → sync to Authentik → audit; ✓ the new employee can use
  Nextcloud/mail/chat/portal immediately; ✓ **business apps are NOT granted** — they remain requestable via v1.
- **AC (fail)** ✗ **no business/LOB/engineering group is ever auto-granted** (only `accessClass=birthright`); ✗ idempotent — replaying the joiner doesn't double-grant; ✗ a failed sync leaves the grant pending + self-heals (reuse v1 AVL-3).
- **DoD** a brand-new employee event → workspace access live, **zero** business access; demoed end-to-end.

### S017 — Leaver: auto-deprovision ALL access  · [IGA-01 / security] · P1 · 5
The highest-value control (kill dangling access).
- **AC** ✓ on a **leaver** event → **revoke ALL** active assignments (birthright + business) → sync removes
  every Authentik membership → audit; ✓ (D4) optionally **disable the Authentik user** + kill sessions.
- **AC (fail)** ✗ nothing is left behind (verify who-has-what = empty for that matricule); ✗ idempotent; ✗ a revoke failure is retried + surfaced by reconcile.
- **DoD** relieving an employee removes every membership; the audit shows the full deprovision; reconcile confirms zero residual.

### S018 — Mover: recompute birthright + flag old access for recert  · [IGA-01 / core] · P2 · 8
- **AC** ✓ on a **position change** → recompute birthright (workspace stays; adjust if position-based
  profiles exist); ✓ **flag the employee's business-app grants for re-certification** (owner/manager review + deadline), don't silently keep or auto-revoke (D5); ✓ audit the move + the flags.
- **AC (fail)** ✗ a move never breaks workspace access; ✗ un-reviewed flagged grants escalate after the deadline (surfaced, not auto-dropped without a decision).
- **DoD** a department change recomputes birthright + opens recert items for the old business access.

### S019 — JML fan-out orchestration (n8n → GLPI + email)  · [IGA-01 / integration] · P2 · 5
The non-access side of onboarding/offboarding — **BYOD-light** (no hardware).
- **AC** ✓ after ktayl-iam applies the access delta, **n8n** opens **GLPI** software/SaaS onboarding
  (joiner) / offboarding (leaver) tasks; ✓ sends the **Stalwart** onboarding/offboarding email; ✓ **no
  laptop/badge/hardware** tasks (BYOD — `workplace-architecture.md`).
- **AC (fail)** ✗ a fan-out failure never rolls back the access decision (best-effort, audited); ✗ ktayl-iam remains the access system of record (n8n does not touch Authentik directly).
- **DoD** a joiner event opens the right GLPI software tasks + an onboarding email; a leaver the reverse.

### S020 — Lifecycle evidence + RH↔IT drift reconcile  · [IGA-01 / core] · P3 · 5
Where the AI hooks later attach.
- **AC** ✓ extend who-has-what + reconcile to detect **HR-vs-access drift** — an active employee missing
  birthright, a **relieved employee still holding access**, a **mover past the recert deadline**; ✓ alert + audit each.
- **AC (fail)** ✗ drift detection is read-only unless the group is platform-exclusive (reuse v1 safe-reconcile); ✗ findings are evidence (append-only), not silent fixes.
- **DoD** an injected "ghost" (relieved-but-still-has-access) is detected + reported; the report is the substrate for later AI (anomalous-access / role-recommendation / JML-anomaly).

> **Later (v4+, not v3):** position-based birthright (Country×Dept×Job ABAC) · HR→Authentik **user**
> provisioning (SCIM) · recert **campaigns** (IGA-03) · SoD rules engine (IGA-05) · the AI assists.

## Sizing (honest)

**≈44 pts total** — this is an **epic, realistically two sprints**:
- **v3-MVP (one sprint, ≈26 pts):** S014 + S015 + S016 + S017 — birthright classification, HR-event
  intake, **Joiner auto-workspace**, **Leaver auto-revoke-all**. This alone delivers the owner's rule +
  the top audit control (no dangling access).
- **v3-complete (follow-on, ≈18 pts):** S018 Mover · S019 fan-out · S020 drift evidence.

**Sequence:** S014 → S015 → S016 ∥ S017 → (S018 · S019 · S020).

## Readiness gate

| Check | Verdict |
|---|---|
| Business need grounded | ✅ the event-driven JML half is genuinely absent (verified: 0 HR workflow activity); it's the SAP-model core |
| Governing principle decided | ✅ **workspace = birthright (auto), business = on-request (four-eyes)** — owner, 2026-10-04 |
| Architecture + boundary | ✅ grounded; reuses v1 catalog/assignment/sync/audit; new = intake + policy engine + orchestration — **crosses HR-integration + authz boundary → governance gate (SA+SEC)** |
| Threat model delta | ✅ new surface = an HR event can now grant/revoke access → mitigated by signed intake (S015), birthright-only auto-grant (S016, never business), immediate leaver revoke (S017), safe reconcile (S020) |
| Dependency | ⚠️ **depends on v2** (multi-user login) for recert/approval actors; the Joiner/Leaver *auto* paths could ship before v2, recert (S018) needs it |
| Scope disciplined | ✅ MVP = birthright+intake+joiner+leaver; mover/fan-out/drift split out; ABAC + SCIM + campaigns deferred to v4 |
| Open (confirm at kickoff) | ⚠️ D1 (webhook vs NATS) · D4 (leaver: disable the Authentik user too?) · D6 (does v3 also mint the Authentik *user*, or assume it exists?) |

**Verdict: PASS as an epic (MVP sprint = S014-S017).** Greenfield but built on v1's proven substrate;
the governing principle + the JML semantics are decided; the three open items are integration choices,
not design blockers. The HR-integration/authz boundary routes through the governance gate before build.
