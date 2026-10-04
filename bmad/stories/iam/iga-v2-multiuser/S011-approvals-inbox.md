---
id: S011-approvals-inbox
title: "Approvals inbox — decide your legs as the signed-in approver"
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
**As a** manager / role owner, **I want** an inbox of the requests awaiting my decision **so that** I
approve or deny them myself — the acting approver is me (the signed-in user), not an override.

## Acceptance criteria
- [ ] AC-1: **My approvals** lists requests where I am an **un-decided assigned leg** (manager or owner).
- [ ] AC-2: approve / deny with a comment.
- [ ] AC-3: my leg disappears from the inbox once decided; the request's state (granted / denied / still-pending) reflects immediately.
- [ ] AC-4 (fail): the dev **approver-override field is gone** in prod — the approver is implicit (me).
- [ ] AC-5 (fail): I cannot see or act on legs that aren't mine.

## DoD
Two distinct humans (the manager + the role owner) each approve from their own inbox → the grant
provisions into Authentik. Demoed end-to-end (the real four-eyes, no override). Ref: sprint plan S011.
