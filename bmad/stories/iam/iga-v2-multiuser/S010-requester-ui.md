---
id: S010-requester-ui
title: "Self-service requester experience (role-aware UI)"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v2 (multi-user)"
estimate: 5
labels: [typescript, iam, frontend]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As an** employee, **I want** a simple self-service console to request access and track it **so that**
I don't need an admin to file a request for me.

## Acceptance criteria
- [ ] AC-1: role-aware nav from `/api/auth/me` (`isAdmin`) — a requester sees **Request access** + **My requests**; an admin keeps the catalog + full console.
- [ ] AC-2: request a role (app → role picker) for **themselves**.
- [ ] AC-3: **My requests** shows status + both approval legs' progress.
- [ ] AC-4: cancel an own pending request.
- [ ] AC-5 (fail): a requester never sees admin-only controls/links (catalog edit, reconcile, who-has-what, export).
- [ ] AC-6 (fail): a 403 from a mis-click surfaces gracefully (not a blank/error page).

## DoD
A non-admin self-serves a request end-to-end in the UI; role-switch smoke (admin vs requester views).
Ref: sprint plan S010.
