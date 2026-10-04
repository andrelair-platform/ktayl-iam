---
id: S012-notifications
title: "Notifications — tell approvers a request needs them + the requester on decision (stretch)"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v2 (multi-user)"
estimate: 5
labels: [typescript, iam, integration]
priority: P3
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As an** approver / requester, **I want** to be notified when a request needs my decision (or mine was
decided) **so that** approvals don't depend on anyone remembering to open the console.

> **Stretch / could-have** — descope cleanly if the sprint is tight; the workflow works without it.

## Acceptance criteria
- [ ] AC-1: on **request-created**, notify the two assigned approvers.
- [ ] AC-2: on **decision / grant / denial**, notify the requester.
- [ ] AC-3 (D4): via email (Stalwart) — **best-effort, never blocks** the workflow; deep-links into the inbox / my-requests.
- [ ] AC-4 (fail): a notification failure is logged + audited, not fatal.
- [ ] AC-5 (fail): no PII beyond what the recipient may already see.

## DoD
An approver receives a mail when a request needs them; a requester is told the outcome. Cleanly
deferred if descoped. Ref: sprint plan S012 · D4.
