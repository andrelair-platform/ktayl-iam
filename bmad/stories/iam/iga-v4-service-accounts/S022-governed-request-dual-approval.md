---
id: S022
title: "Governed service-account request + dual-approval (reuse the workflow)"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 5
labels: [iam, backend, security]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
---

## Story

As an **account owner**, I want to **request a service account** and have it pass **dual approval** before it
is created, so that a privileged non-human identity is never minted without four-eyes governance.

## Background

The existing `WorkflowService` (manager + owner legs, four-eyes, no self-approval — `approver-resolution.ts`)
is production-ready for *human role* requests. A service account has no HR manager, so the approver resolution
differs: the request is for a **service account in a group**, the requester is a **human**, and the two legs
are the **owner** + a **Security/Platform approver** (a fixed governance role), still four-eyes. (IGA-06.)

## Acceptance Criteria

- [ ] **AC-1** — `POST /api/service-accounts/requests` files a request: `{ name, type, groupRefs[], owner,
      justification }`. Creates a `service_account` in status `requested` (S021) + a request record. Requires a
      **non-blank justification** (service accounts are high-risk → an audit reason is mandatory → 422 without).
- [ ] **AC-2** — **dual-approval, reusing the workflow four-eyes rule**: the two approver legs are the
      **account owner** and a **Security/Platform approver** (a configured governance group), never the same
      person, never the requester. Reuse `resolveApprovers()` / the four-eyes enforcement; a clash escalates to
      `needsManualReview` exactly as today.
- [ ] **AC-3** — `POST /api/service-accounts/requests/{id}/decide` records a leg (approve/deny). A denial
      rejects immediately; **both approved → the account moves to approved** and hands off to S023 (provision).
      No side effect (no Authentik write) until both legs approve.
- [ ] **AC-4** — every transition audited (`service_account.requested` / `.owner_approved` /
      `.security_approved` / `.denied` / `.approved`) with actor + justification in the `audit_log`.
- [ ] **AC-5** — authz: only an admin or the named owner may file; only the resolved approvers may decide
      (401/403 enforced, reusing the existing guards).

## Technical Notes
- Prefer **extending** `WorkflowService` with a service-account request path over a parallel flow — reuse the
  decision state machine + audit, swap only the approver-resolution source (no HR manager; owner + Security).
- The "Security/Platform approver" = a configured Authentik group / role (e.g. `Platform Admins`) resolved
  once and frozen on the request (deterministic, like the human flow).
- No Authentik or Vault writes in this story — approval only produces an `approved` service account for S023.

## Definition of Done
- [ ] Vitest unit + e2e: both-approved-only provisions; denial rejects; owner-as-requester/clash → backup or
      manual review; missing justification → 422; non-approver decide → 403. Audit entries asserted.

## Dependencies
- Depends on: S021 (the entity). Blocks: S023 (provision runs on `approved`).
