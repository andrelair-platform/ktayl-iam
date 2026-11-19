---
id: IGA-06
title: "EPIC: Governed service/technical-account provisioning"
status: Ready
type: Epic
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 13
labels: [epic, iam, security]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
---

## Epic

Extend ktayl-iam to govern the lifecycle of **service / technical (non-human) accounts** — the highest-risk
standing identities — through the *existing* request → **dual-approval** → provision-to-Authentik machinery,
plus Vault-stored credentials and recertification. Closes the gap surfaced on 2026-11-18: the only way to
create a `GROUP_<x>` service account today is an ad-hoc `ak-shell` poke on production Authentik, which the
platform guardrails correctly block. (Issue #79.)

## Why

Service accounts are privileged, long-lived, and non-human — exactly the identities IGA exists to control.
ktayl-iam already governs **human** access (joiner/mover/leaver + dual-approval + Authentik group sync); it has
**no** notion of a service account. So a QA/test/M2M identity must be hand-minted on the live IdP — ungoverned,
unaudited, and guardrail-blocked. This epic makes service-account issuance a **governed, audited, recertified**
act, and its first concrete consumer is a reusable **QA-tester service identity** (`ktayl-qa-finance`) that
unblocks the finance module's live authenticated-200 QA.

## What we REUSE (de-risks the build — it's an extension, not greenfield)

The codebase assessment (2026-11-19) confirms the two hard parts already exist and are production-ready:
- **Dual-approval workflow** (`workflow/workflow.service.ts`, `approver-resolution.ts`) — manager+owner legs,
  four-eyes, no self-approval, fully tested. Reused with a service-account-shaped approver pair.
- **Authentik provisioning adapter** (`directory/authentik.client.ts` + `sync/sync.service.ts`) —
  `ensureUser`/`ensureGroup`/`addUserToGroup`/`removeUserFromGroup`, idempotent, hourly reconcile, least-priv
  tokens, audited. Reused + extended for the service-account user type + an app-password token.

## What we BUILD (the delta)

| Story | Scope |
|---|---|
| **S021** | `service_account` entity + TypeORM migration (name-keyed, not matricule; owner, group refs, status, vault_ref, created_by/at) — the data model. |
| **S022** | The **governed request + dual-approval** for a service account (reuse `WorkflowService`): requester = a human owner; approvers = the owner + a Security/Platform approver (four-eyes), **no** HR-manager resolution. |
| **S023** | **Authentik provisioning + Vault token** on approval: `ensureServiceAccount` (Authentik `service_account` user) + `addUserToGroup` + mint an app-password + store it in **Vault** (ESO path), audited. Reuse `SyncService` + reconcile. |
| **S024** | **Recertification + UI + the first identity**: a periodic recert of service accounts (owner re-attests or it's flagged) + requester/approver UI + provision **`ktayl-qa-finance`** (Finance group) end-to-end — the demo that replaces the blocked ak-shell path and unblocks the finance live-200 QA. |

## Out of scope / deferred
- Full PAM/secret-rotation (token rotation is a later story; v1 mints + stores, recert attests).
- SCIM to business apps (that's IGA-04).

## Definition of Done (epic)
- [ ] A service account can be **requested, dual-approved, and provisioned to Authentik** (user + group) with
      its credential in Vault — no ak-shell, fully audited.
- [ ] **Recertification** exists for the standing service identities.
- [ ] `ktayl-qa-finance` provisioned end-to-end + used to run the finance live authenticated-200 QA (closes
      that QA debt).
- [ ] Reuses the existing workflow + Authentik adapter (no parallel provisioning path); Vitest unit + e2e
      green; the obligations/audit trail reflects service-account issuance.

## Governance gate (Path-B, security-boundary)
This touches the **identity trust boundary** (privileged non-human credentials) → the architecture + security
review gate (`bmad-compliance.md`) applies before build; record the decision in an ADR + the RACI.

## Dependencies
- Depends on: the existing workflow + Authentik adapter (live).
- Unblocks: the finance live-200 QA (ktayl-core FINCLOSE), and any future M2M/QA/service identity (replaces ad-hoc ak-shell).
