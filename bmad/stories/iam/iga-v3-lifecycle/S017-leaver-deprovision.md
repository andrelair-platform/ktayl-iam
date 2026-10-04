---
id: S017-leaver-deprovision
title: "Leaver — auto-deprovision ALL access on the HR relieve event"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v3 (JML lifecycle)"
estimate: 5
labels: [typescript, iam, security]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the security/compliance owner, **I want** a departing employee's access removed automatically the
moment HR relieves them **so that** there is **no dangling access** — the classic audit finding, closed.

## Acceptance criteria
- [ ] AC-1: on a **leaver** event → **revoke ALL** active assignments (birthright **and** business) → sync removes every Authentik membership → audit.
- [ ] AC-2 (D4): optionally **disable the Authentik user** + invalidate sessions.
- [ ] AC-3 (fail): who-has-what for that matricule is **empty** afterwards (nothing left behind).
- [ ] AC-4 (fail): **idempotent**; a revoke failure is retried + surfaced by reconcile.

## DoD
Relieving an employee removes every membership; the audit shows the full deprovision; reconcile confirms zero residual access. Ref: sprint plan S017 · D4.
