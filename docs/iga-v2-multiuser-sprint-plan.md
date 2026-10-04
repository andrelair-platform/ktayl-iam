# Sprint Plan — Access Governance v2 (real multi-user login)

> **BMAD artefact — SPRINT PLAN + READINESS GATE.** Decomposes the v2 increment into implementable
> stories with ACs and states the readiness verdict. **Path-B feature** on the existing ktayl-iam
> product (it crosses the **authn/authz security boundary** → the governance gate applies to S009).
> **Status: DRAFT for review.** Stories sync to board **#17** on build start.

## Why this sprint

The IGA v1 slice (S001–S007) is live on dev: request → four-eyes dual approval → Authentik
provisioning → who-has-what + audit. But the console is **admin-only** — only `Platform Admins` can
log in — so *true* four-eyes needs two humans and is only *demo-able* today (a dev-only
`ALLOW_APPROVER_OVERRIDE` lets one admin act both legs). **v2 makes the control operational:** ordinary
employees log in as **requesters**, managers + role owners log in as **approvers**, and the dev override
is retired in prod. This is the increment that turns the control from demo-able into enforced.

## Grounding (verified 2026-10-04)

- The admin-only gate is **purely in the app** (`backend/src/auth/oidc.strategy.ts` →
  `authorizeFromVerifyArgs` throws `Unauthorized` unless the user is in `ADMIN_GROUP`).
- The **Authentik Application `ktayl-iam[-dev]` has NO policy binding** → Authentik already issues a
  token to any authenticated user. **So v2 is a backend-authz refactor — no Authentik change is needed
  to admit non-admins** (optionally add a birthright group gate — see Decision D1).
- The decide path **already** enforces "approver must be an assigned leg + not the requester" in
  `WorkflowService.decide` — so the *approver* role is naturally **dynamic/per-request**, not a static
  group (see Decision D2). v2 mostly removes the login gate and scopes what each role *sees*.

## The role model (the target)

| Role | Who | Can |
|---|---|---|
| **Requester** | any authenticated employee | request a role **for themselves**; list / cancel **their own** pending requests |
| **Approver** | **dynamic** — the request's `managerApprover` or `ownerApprover` | see requests where they are an **un-decided assigned leg**; decide that leg (no self-approval) |
| **Access admin / auditor** | `Platform Admins` (ADMIN_GROUP) | everything: catalog write, who-has-what, audit export, reconcile, revoke, view all requests, file on behalf |

## Key design decisions (recommendation — confirm at kickoff)

- **D1 — who may log in.** *Recommendation:* admit **any authenticated Authentik user** (the app has no
  policy binding today), but gate the console on a **birthright group** (`ktayl-staff` / the real
  all-staff group) so only employees — not every Authentik principal — reach it. Cheap to add; matches
  the design's birthright concept. Alternative: open to all authenticated. (Low-risk either way.)
- **D2 — approver = dynamic, not a group.** *Recommendation:* keep the **per-request** approver model
  (you're an approver iff you're that request's manager/owner leg) — the service already enforces it,
  and it avoids a brittle global "approvers" group. No static approver group.
- **D3 — requester identity is the session, not the payload.** A non-admin may **only** request for
  their **own** matricule (server-forced); only an admin may file on behalf. Closes the
  spoof-a-requester gap once non-admins can call the API.
- **D4 — notifications channel (S012, stretch).** *Recommendation:* email via Stalwart (simplest,
  everyone has a mailbox) with Matrix/n8n as a later option; best-effort, never blocks the workflow.

## Story breakdown

Each: parent epic · priority · estimate · acceptance criteria (happy + failure) · DoD.

### S008 — Multi-user authentication (admit any authenticated user)  · [IGA-01 / security] · P1 · 5
Drop the admin-only **login** gate; authenticate any employee, carry their identity + admin flag.
- **AC** ✓ a non-admin Authentik user can complete OIDC login and gets a session (no longer 401 at the gate); ✓ `AuthUser` gains `isAdmin` (derived from `ADMIN_GROUP` membership) + the resolved matricule; ✓ the global `AuthenticatedGuard` still requires a session on every non-`@Public()` route.
- **AC (fail)** ✗ (D1) login is gated on the **birthright group** — a user in neither staff nor admin is rejected with a clear message; ✗ no endpoint is left wide-open by the gate removal (every former admin route is re-protected in S009 — land S008+S009 together).
- **DoD** a non-admin logs into dev and reaches a (scoped) console; admin still flagged `isAdmin`; unit tests cover admit-non-admin / reject-outsider / isAdmin-true.

### S009 — Role-based authorization (AdminOnly guard + request scoping)  · [IGA-01 / security] · P1 · 8
Replace "global admin" with per-capability authorization. **Crosses the authz boundary → governance gate.**
- **AC** ✓ an `@AdminOnly()` guard protects catalog-write, `/access/*`, `/sync/*`, revoke, and "view all requests"; ✓ a requester endpoint set — `POST /requests` (self only), `GET /requests?requester=me`, cancel-own-pending; ✓ `GET /requests` returns **only mine-or-to-approve** for a non-admin, **all** for an admin; ✓ decide uses the **session user** as approver.
- **AC (fail)** ✗ (D3) a non-admin requesting with someone else's `requesterId` is rejected/forced-to-self server-side; ✗ a non-approver (not an assigned leg) still cannot decide (unchanged guarantee); ✗ no self-approval (unchanged); ✗ `ALLOW_APPROVER_OVERRIDE` has **no effect in prod** (dev-only).
- **DoD** authz matrix unit-tested (admin vs requester vs approver × each endpoint); the **security review gate** is recorded (ADR + RACI) before merge.

### S010 — Self-service requester experience (UI)  · [IGA-01 / frontend] · P2 · 5
A non-admin lands on a requester console, not the admin catalog.
- **AC** ✓ role-aware nav from `/api/auth/me` (`isAdmin`): a requester sees **Request access** + **My requests**; an admin keeps the catalog + full console; ✓ request a role (app→role picker) for themselves; ✓ **My requests** shows status + the two legs' progress; ✓ cancel an own pending request.
- **AC (fail)** ✗ a requester never sees admin-only controls/links (catalog edit, reconcile, who-has-what, export); ✗ a 403 from a mis-click surfaces gracefully.
- **DoD** a non-admin can self-serve a request end-to-end in the UI; Playwright/role-switch smoke.

### S011 — Approvals inbox (UI)  · [IGA-01 / frontend] · P2 · 5
Approvers get a real queue; the acting approver is the session user.
- **AC** ✓ **My approvals** lists requests where I am an **un-decided assigned leg** (manager or owner); ✓ approve/deny with comment; ✓ my own leg disappears once decided; ✓ grant/denial reflects immediately.
- **AC (fail)** ✗ the dev **approver-override field is gone** in prod (the approver is implicit = me); ✗ I cannot see/act on legs that aren't mine.
- **DoD** two distinct humans (manager + owner) each approve from their own inbox → the grant provisions; demoed end-to-end.

### S012 — Notifications (requester + approver)  · [IGA-01 / integration] · P3 · 5 · *stretch/could-have*
Close the loop so approvals don't depend on polling the UI.
- **AC** ✓ on **request-created**, notify the two assigned approvers; ✓ on **decision/grant/denial**, notify the requester; ✓ (D4) via email (Stalwart) — best-effort, **never blocks** the workflow; ✓ links deep-link into the inbox/my-requests.
- **AC (fail)** ✗ a notification failure is logged + audited, not fatal; ✗ no PII beyond what the recipient may already see.
- **DoD** an approver receives a mail when a request needs them; deferred cleanly if descoped.

### S013 — Prod hardening + shared session store, then promote  · [IGA-01 / devops] · P2 · 3
Make it HA + retire the dev affordance, then promote through the gate.
- **AC** ✓ `ALLOW_APPROVER_OVERRIDE=false` in the **prod** overlay; ✓ express-session moved to a **shared store** (Postgres/Redis) so it survives multi-replica/restart (MemoryStore is single-replica only); ✓ prod overlay sets the real birthright/admin groups.
- **AC (fail)** ✗ a session survives a pod restart / second replica; ✗ the **live QA gate** (adversarial pass on dev) is clean **before** the CODEOWNERS Kargo prod PR.
- **DoD** ktayl-iam promotable to prod with real multi-user auth; QA-gate report attached.

> **Later (not this sprint):** leaver auto-deprovision · recertification campaigns (IGA-03) · SCIM to
> business apps (IGA-04) · SoD rules engine (IGA-05) · delegated/temporary approver (out-of-office).

**Sprint total ≈ 31 pts** (26 without the S012 stretch). **Sequence:** S008 → S009 (authn then authz,
land together) → S010 ∥ S011 (the two role UIs, parallel) → S012 (stretch) → S013 (harden + promote).

## Readiness gate

| Check | Verdict |
|---|---|
| Business need grounded | ✅ v1 is admin-only → the four-eyes control is demo-able, not operational; v2 makes it enforced by real distinct humans |
| Product contract | ✅ reuses the v1 PRD/NFR; the role model + D1–D4 above are the only new product decisions |
| Architecture + boundary | ✅ grounded in the live code (gate is app-only; Authentik app has no policy binding; decide already enforces leg-matching) — **S009 crosses the authz boundary → governance gate (SEC review) required** |
| Threat model delta | ✅ new surface = "non-admin can now call the API" → mitigated by the AdminOnly guard + requester-self-scoping (D3) + the unchanged no-self-approval/leg-matching |
| Stack decided | ✅ no new stack (NestJS + Next.js + Postgres) |
| Scope disciplined | ✅ thin: authn → authz → 2 role UIs → (stretch notif) → harden+promote; recert/SCIM/leaver deferred |
| Open (confirm at kickoff, not blockers) | ⚠️ D1 (birthright group name — query the real all-staff group) · D4 (email vs Matrix) |

**Verdict: PASS (Path B).** The design is grounded in the live system, the only new decisions are the
role model + D1–D4 (all with recommendations), and S009's authz-boundary change routes through the
governance gate. No design blockers.
