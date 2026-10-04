---
id: S013-prod-harden-promote
title: "Prod hardening + shared session store, then promote through the gate"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v2 (multi-user)"
estimate: 3
labels: [typescript, iam, devops]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the platform owner, **I want** multi-user auth hardened + HA and then promoted to prod **so that**
the four-eyes control is live for real, not just on dev.

## Acceptance criteria
- [ ] AC-1: `ALLOW_APPROVER_OVERRIDE=false` in the **prod** overlay (the dev demo affordance is off).
- [ ] AC-2: express-session moved to a **shared store** (Postgres/Redis) — survives multi-replica + pod restart (MemoryStore is single-replica only).
- [ ] AC-3: the prod overlay sets the real birthright + admin group names.
- [ ] AC-4 (fail): a session survives a pod restart / a second replica.
- [ ] AC-5 (fail): the **live QA gate** (adversarial pass on the dev deployment) is clean **before** the CODEOWNERS Kargo prod PR is opened.

## DoD
ktayl-iam promotable to prod with real multi-user auth; the QA-gate report is attached to the promotion
PR. Ref: sprint plan S013 · qa-gate.md · gitops.md (Kargo prod gate).
