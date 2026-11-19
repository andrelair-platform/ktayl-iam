---
id: S024
title: "Service-account recertification + UI + provision the ktayl-qa-finance identity"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 5
labels: [iam, backend, frontend, security]
priority: P3
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
---

## Story

As an **account owner / compliance officer**, I want service accounts to be **periodically recertified** and a
UI to request/approve/view them, and I want the first governed identity — **`ktayl-qa-finance`** — provisioned
end-to-end, so the capability is proven and the finance live-200 QA debt is closed.

## Background

Standing service accounts are the highest-risk identities → they must be **re-attested**, not set-and-forget.
This story adds the recert loop + the UI (the backend is ready after S021–S023) and delivers the first concrete
identity, which replaces the guardrail-blocked ak-shell path and unblocks the ktayl-core finance QA. (IGA-06.)

## Acceptance Criteria

- [ ] **AC-1 — recertification**: a scheduled job (mirror the hourly reconcile cadence, but periodic e.g.
      quarterly) that flags each `active` service account whose `lastRecertifiedAt` is stale; the **owner**
      re-attests (sets `lastRecertifiedAt`) or the account is flagged `review` / disabled per policy. Each
      recert decision is audited.
- [ ] **AC-2 — UI** (Next.js, reuse the requester/approver components, S010/S011 pattern): a page to **request**
      a service account (name/type/groups/owner/justification), an **approvals** view for the Security/owner
      legs, and a **list/detail** showing status, groups, owner, vault ref (not the secret), and recert state.
- [ ] **AC-3 — the first identity, end-to-end**: provision **`ktayl-qa-finance`** (type `qa`, group `Finance`,
      owner = the platform owner) **through the governed flow** (request → dual-approve → S023 provision) → an
      Authentik service account in `Finance` + an app-password in Vault. No ak-shell.
- [ ] **AC-4 — prove it unblocks the finance QA**: mint a client-credentials token with the stored credential
      (`grant_type=client_credentials`, groups claim contains `Finance`) and confirm it is accepted by
      ktayl-core (a `GROUP_Finance` 200 on `GET /api/finance/periods/{YYYY-MM}/reconciliation`) — i.e. the
      identity that lets the finance live authenticated-200 QA run. Record the result on the ktayl-core QA debt.
- [ ] **AC-5 — reusable**: the harness/runbook for "provision a QA/service identity" is captured so the next
      one is a UI request, not an incident.

## Technical Notes
- Recert = the IGA control for standing accounts (DORA/GDPR auditability); keep it a cron + an owner action,
  audited — not a silent expiry.
- The `ktayl-qa-finance` token is the reusable **QA regression identity** for every future prod promotion
  (`prod-promotion-qa-gate`) — it closes the "hand-mint a token" gap for good.
- Don't leave `ktayl-qa-finance` as a one-off script; it's created **by the feature**, which is the point.

## Definition of Done
- [ ] Recert job + UI shipped; `ktayl-qa-finance` provisioned through the governed flow (no ak-shell);
      a client-credentials token from Vault gets a **200** on a `GROUP_Finance` ktayl-core endpoint (the finance
      live-200 QA runs green); Vitest + e2e green; the obligations/audit trail reflects it.

## Dependencies
- Depends on: S021 + S022 + S023.
- Closes: the ktayl-core finance live-200 QA debt (the equivalence-basis prod promotion gets its live gate);
  **closes IGA-06 / #79**.
