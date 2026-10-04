---
id: S009-rbac-authorization
title: "Role-based authorization — AdminOnly guard + requester/approver scoping"
status: Done
type: Story
epic: iam
milestone: "IGA — Access Governance v2 (multi-user)"
estimate: 8
labels: [typescript, iam, security]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the platform, **I want** each capability authorized by role (admin vs requester vs the
request's own approvers) **so that** admitting non-admins doesn't expose admin actions — the gate moves
from "global admin" to per-capability.

> **Crosses the authn/authz security boundary → the governance gate (SEC review) applies.**

## Acceptance criteria
- [ ] AC-1: an `@AdminOnly()` guard protects catalog-write, `/access/*`, `/sync/*`, assignment revoke, and "view all requests".
- [ ] AC-2: requester endpoints — `POST /requests` (self only), `GET /requests?requester=me`, cancel own pending.
- [ ] AC-3: `GET /requests` returns **only mine-or-to-approve** for a non-admin, **all** for an admin.
- [ ] AC-4: decide uses the **session user** as approver (the dynamic per-request leg model, D2).
- [ ] AC-5 (fail): a non-admin passing someone else's `requesterId` is rejected / forced-to-self server-side (D3).
- [ ] AC-6 (fail): a non-assigned user still cannot decide, and no self-approval — unchanged guarantees.
- [ ] AC-7 (fail): `ALLOW_APPROVER_OVERRIDE` has **no effect in prod** (dev-only affordance).

## DoD
Authz matrix unit-tested (admin / requester / approver × each endpoint). The **security-review gate**
is recorded (ADR + RACI) before merge. Ref: sprint plan S009 · D2/D3 · bmad-compliance governance gate.
