---
id: S020-lifecycle-drift-evidence
title: "Lifecycle evidence + RH↔IT drift reconcile (ghost/creep detection)"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v3 (JML lifecycle)"
estimate: 5
labels: [typescript, iam, core]
priority: P3
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As an** auditor, **I want** the platform to continuously detect divergence between the HR reality and
granted access **so that** ghosts (relieved-but-still-has-access) and creep (mover past recert) surface
as evidence — and so the later AI assists have a substrate.

## Acceptance criteria
- [ ] AC-1: extend who-has-what + reconcile to detect **HR↔access drift** — an active employee missing birthright, a **relieved employee still holding access**, a **mover past the recert deadline**.
- [ ] AC-2: each finding is alerted + audited (append-only evidence).
- [ ] AC-3 (fail): drift detection is **read-only** unless the group is platform-exclusive (reuse v1 safe-reconcile — never nuke hand-managed groups).
- [ ] AC-4 (fail): findings are evidence, **not** silent auto-fixes.

## DoD
An injected "ghost" (relieved but still has access) is detected + reported; the report is the documented substrate for later AI (anomalous-access · role-recommendation · JML-anomaly). Ref: sprint plan S020.
