---
id: S005-authentik-sync-engine
title: "Authentik sync engine (provision on both-approved + reconcile drift)"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 8
labels: [typescript, iam, integration, security]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the platform, **I want** to turn an approved assignment into a real Authentik group membership **so that**
login actually enforces the granted role — and to heal any drift.

## Acceptance criteria
- [ ] AC-1: on **both-approved**, create/update the Authentik **group + membership** via the API.
- [ ] AC-2: **idempotent** — applying a grant twice = one membership; a failed sync retries with **no lost membership** (AVL-3).
- [ ] AC-3: **revoke** removes the membership.
- [ ] AC-4: a scheduled **reconcile** job diffs DB↔Authentik, heals hand-edits (threat T5) and alerts on drift.
- [ ] AC-5 (fail): the Authentik token is **least-privilege** (groups/memberships only, threat T4).

## DoD
Grant → login-enforced demoed end-to-end; drift injected → reconciled. Ref: sprint plan S005 · NFR AVL-3/4.
