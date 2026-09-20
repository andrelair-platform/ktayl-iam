---
id: S004-dual-approval-workflow
title: "Access request → DUAL approval (manager + role owner, four-eyes)"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 8
labels: [typescript, iam, security]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As a** user who needs a role in an app, **I want** to request it and have it **double-validated** **so that**
access is only granted when both my manager and the role owner agree (four-eyes) — the core control (ADR-007).

## Acceptance criteria
- [ ] AC-1: a user requests role R in app A → it requires **BOTH** the **manager** and the **role owner** to approve (order-independent).
- [ ] AC-2: **either denial** rejects the request; nothing is provisioned.
- [ ] AC-3: each approval records approver / decision / timestamp / comment → audit trail.
- [ ] AC-4 (fail): **no self-approval** — requester ≠ approver enforced **server-side**; if requester is the manager/owner, that leg reassigns to a backup (SoD, threat T1).
- [ ] AC-5 (fail): nothing reaches Authentik until **both** approve (provisioning is S005).

## DoD
Happy path (2 approvals → granted-pending-sync) + both denial paths + self-approval reassignment tested. Ref: sprint plan S004 · ADR-007.
