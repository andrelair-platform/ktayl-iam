# Retrospective — Access Governance v3 (JML / event-driven lifecycle)

> **BMAD artefact — RETROSPECTIVE VERDICT (committed audit trail).** Evidence-based epic-boundary
> review of the v3 JML lifecycle sprint, against `iga-v3-lifecycle-sprint-plan.md`. Companion to the
> org-site as-built page (`minicloud-platform-docs` → *Access Governance — ktayl-iam*). Date: 2026-10-05.
> Verdict owner: AndreLiar (SA/TL). Status: **v3-MVP COMPLETE, live on dev + prod.**

## Scope delivered vs planned

| Story | Planned (sprint plan) | Delivered | Verdict |
|---|---|---|---|
| **S014** birthright vs on-request classification | per-role `accessClass` field + a birthright *profile* set | **birthright `Workplace Users` group** (membership = the workspace suite); business/LOB apps stay on the v1 request path | ✅ **done, simplified** — group membership achieves the same control with less schema; see *What changed* D-A |
| **S015** HR-event intake | Frappe **Webhook** → signed `POST /api/lifecycle/events` + poll-reconcile | **NATS JetStream** `HR_LIFECYCLE` (HMAC-signed events, durable consumer `HrLifecycleConsumer`); ERPNext emits via the n8n/event bus | ✅ **done, re-architected** — took the plan's "alt: NATS" over the webhook rec; see D-B |
| **S016** Joiner auto-provision | compute birthright → auto-grant workspace groups (no four-eyes); **assume the Authentik user exists** (D6 → v4) | birthright group add **+ mints the Authentik user (`ensureUser`) + provisions the Stalwart mailbox** + persists a requestable `Identity` | ✅ **done, scope-expanded** — HR→Authentik user provisioning + mailbox (planned for v4) shipped now; see D-C |
| **S017** Leaver auto-deprovision ALL | revoke all on the relieve event (D4: optionally disable the Authentik user) | **scheduled** revocation — a daily 02:00 sweep revokes **the day STRICTLY AFTER** the HR leave date: all assignments + business groups + birthright group + **Authentik disable** + **Stalwart mailbox archival**; backdated date → immediate | ✅ **done, refined** — owner changed D4 from immediate-on-event to *date-driven scheduled*; mailbox archival added; see D-D |
| **S018** Mover recompute + recert | recompute birthright + flag business grants for re-cert | **minimal** — a Mover updates identity attributes only (shares the joiner path); recompute + recert **not** built | 🟡 **deferred** (was P2 / v3-complete, as planned) |
| **S019** JML fan-out (n8n → GLPI + email) | n8n opens GLPI onboarding/offboarding + sends email | **the Leaver/Joiner non-access fan-out via n8n (HR-12) exists** (GLPI ticket + email, HMAC-verified) but is wired to the HR event, not yet to the ktayl-iam access-delta | 🟡 **partial** — fan-out mechanism live; access-delta-driven trigger deferred |
| **S020** lifecycle evidence + RH↔IT drift | detect HR-vs-access drift (ghost accounts) as evidence | **not built** | 🔴 **deferred** (was P3) |

**MVP (S014–S017) = 100% delivered + live on prod.** The follow-on (S018–S020) is deferred as the plan
itself sized it (two-sprint epic; MVP = the owner's rule + the top audit control). No MVP story was dropped.

## What changed from the plan — and why (the honest design deltas)

- **D-A — birthright as a group, not an `accessClass` field.** The plan modelled birthright as a per-role
  attribute + a profile set. We implemented it as **one Authentik group (`Workplace Users`)** every joiner
  is added to, bound to the whole workspace suite. *Why:* the control the owner wanted — "workspace by
  default, business on-request" — is fully expressed by group membership, and it reuses the existing
  Authentik-group sync verbatim. The `accessClass` schema would have added a migration + catalog surface
  for no extra control at MVP. **Trade-off accepted:** the birthright *set* is defined by the group's app
  bindings (admin-governed in Authentik), not a first-class catalog object — fine for a flat profile;
  revisit if position-based (ABAC) birthright lands (v4).

- **D-B — NATS, not a Frappe webhook.** The plan *recommended* a signed webhook; we took the documented
  **alt (NATS JetStream)**. *Why:* the platform already runs a hardened NATS bus (claims CDC), it gives
  **durable, replayable, ordered-per-subject** delivery for free (the plan's idempotency + self-heal ACs
  come from JetStream, not hand-rolled), and HMAC-signing the event body covers the "reject forged event"
  AC. **Trade-off:** one more moving part than a direct HTTP post, but it removes the bespoke
  poll-reconcile the webhook path needed. The single-durable rule (exactly one consumer env) became an
  operational constraint — see *Ops learning*.

- **D-C — the Joiner mints the identity end-to-end (ahead of plan).** D6 deferred HR→Authentik **user**
  creation and mailbox to "v4 / separate concern"; the owner's requirement — *"when a new employee is
  created with their matricule, their email must also be created"* — pulled both into S016. The Joiner now
  **creates the Authentik user, provisions the Stalwart mailbox (JMAP), and derives the collision-safe
  `firstname.lastname@` address**. *Why it's right:* a "joiner" that can't log in or receive mail isn't a
  joiner; splitting it to v4 would have shipped a half-capability. **Trade-off:** more surface in one
  story, carried by best-effort-per-leg + idempotency so a partial failure self-completes on redelivery.

- **D-D — Leaver is date-driven + scheduled, not immediate-on-event; + mailbox archival.** The owner
  refined D4: *"once RH sets the leave date, the next date after that date the system automatically
  revokes all rights."* So revocation is a **daily sweep** keyed on `offboardDate < today` (strictly
  after), not fire-on-relieve. A **backdated** date still revokes immediately (catch-up). We also added
  **Stalwart mailbox archival** (clear credentials) because disabling the Authentik user leaves the
  **direct IMAP/SMTP** path open — a gap the SSO-only view would have missed. *Why it's right:* matches
  how HR actually works (a future-dated departure) and closes the real residual access path.

## Evidence (verified, not asserted)

- **Tests:** 98 backend unit tests green (lifecycle module: email derivation, HMAC canonical-JSON verify,
  Stalwart client, joiner/leaver/sweep paths, idempotency, best-effort legs).
- **HMAC contract:** proven byte-identical to the Python producer via a golden vector (accents included) —
  the n8n Code-node rebuild of Python-canonical JSON was the fix for the parsed-body mismatch.
- **Live QA (dev):** pod on the new image, Nest boots clean, `LifecycleModule` initialized, consumer
  correctly **disabled on dev** (prod owns the durable). Stalwart JMAP suspend mechanism verified against a
  throwaway account: `credentials:{}` → IMAP `AUTHENTICATIONFAILED`, mailbox + address preserved, reversible.
- **Prod:** promoted `9fd06f1 → a7c17b4` via git-Warehouse Kargo → CODEOWNERS PR (#1632) → ArgoCD
  Synced/Healthy; `HrLifecycleConsumer bound to HR_LIFECYCLE` on prod.

## What went well
- **Reuse paid off** — the v1 assignment lifecycle + Authentik sync + append-only audit absorbed the JML
  access-delta with no change; v3 added only intake + birthright + orchestration, as planned.
- **Best-effort-per-leg + idempotency** made a multi-system Joiner (Authentik + Stalwart + DB) safe to
  retry — a failed leg leaves its flag false and self-completes on redelivery; no partial-corrupt identity.
- **The mock-discipline lesson held:** every mocked boundary (Authentik, Stalwart) was backed by a live
  verification against the real collaborator (the Stalwart JMAP suspend was proven on a real account before
  the wiring shipped) — the exact gap `testing.md` warns about.

## What to improve (action items)
1. **S018 Mover is a stub** — a department change should recompute birthright + open re-cert items; today
   it only updates attributes. *Owner: next lifecycle increment.* 🟡
2. **S020 drift reconcile (ghost-account detection) not built** — the "relieved-but-still-has-access"
   detector is the highest-audit-value follow-on and the substrate for the later AI assists. *Owner: v3-complete.* 🔴
3. **Deliver-then-rotate mailbox password** — the Joiner stores a generated initial password; add a
   self-service first-login rotation. 🟡
4. **L2/L3 for the lifecycle module** — it shipped on L1 (unit) + live QA; add an L2 integration test
   against a real NATS + a contract test for the ERPNext event schema, per `testing.md` (Tier-A full set).
   The live QA caught what mocks couldn't, but the layer is owed. 🟠
5. **Single-durable ops guardrail** — "exactly one env consumes `HR_LIFECYCLE`" is enforced only by the
   dev overlay having a blank `HR_NATS_URL`. Document it in the runbook so a future dev-enable doesn't
   silently split the stream. 🟡 (captured in memory `feedback_crossservice_m2m_auth_wiring` + the as-built doc.)

## Ops learning (durable)
- **Exactly one environment owns a durable consumer.** Two consumers on the same durable split/compete the
  stream → set `HR_NATS_URL` on **prod only**; dev's blank is deliberate, not a misconfig.
- **Mailbox archival ≠ SSO disable.** Disabling the Authentik user cuts SSO/browser; the Stalwart
  principal still takes direct IMAP/SMTP until its credential is cleared. A leaver needs **both**.

## Verdict

**PASS (epic-boundary) for v3-MVP.** The sprint delivered the owner's governing principle (workspace =
birthright, business = on-request) and the top audit control (no dangling access on a leaver), live on
prod, with the identity fully minted on a joiner (Authentik user + mailbox). The three design deltas
(group-birthright, NATS intake, date-driven leaver) are **improvements** on the plan, each with an
accepted trade-off recorded above. S018–S020 remain open as the plan scoped them — the next lifecycle
increment starts from this verified base.
