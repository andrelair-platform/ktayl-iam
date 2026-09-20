---
id: S003-directory-manager-resolution
title: "Directory (Authentik) + manager resolution (ERPNext HR)"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 5
labels: [typescript, iam, integration]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the approval workflow, **I want** to know who exists and who each user's manager is **so that**
requests can be routed to the correct manager for approval.

## Acceptance criteria
- [ ] AC-1: read **users + groups from Authentik** (read-only).
- [ ] AC-2: read the **manager ↔ report hierarchy from ERPNext** (HR source of truth) → resolve any user's manager (approver #1).
- [ ] AC-3 (fail): manager is **never** taken from the request payload — only from HR (threat T3).
- [ ] AC-4 (fail): a user with no resolvable manager can't silently self-serve — routed to a flagged fallback approver.

## DoD
Manager lookup demoed for real employees. Ref: sprint plan S003 · NFR COR-2.
