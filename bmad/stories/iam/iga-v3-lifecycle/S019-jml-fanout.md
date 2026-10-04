---
id: S019-jml-fanout
title: "JML fan-out orchestration — n8n → GLPI tasks + onboarding/offboarding email (BYOD-light)"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v3 (JML lifecycle)"
estimate: 5
labels: [iam, integration, devops]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** IT/HR ops, **I want** the non-access side of onboarding/offboarding handled automatically **so
that** a joiner/leaver event also opens the right software tasks and sends the right email — with **no
hardware steps** (BYOD).

## Acceptance criteria
- [ ] AC-1: after ktayl-iam applies the access delta, **n8n/Temporal** opens **GLPI** software/SaaS onboarding (joiner) / offboarding (leaver) tasks.
- [ ] AC-2: sends the **Stalwart** onboarding / offboarding email (deep-linked to the self-service / inbox).
- [ ] AC-3: **no laptop / badge / hardware** tasks — BYOD (`workplace-architecture.md`).
- [ ] AC-4 (fail): a fan-out failure **never** rolls back the access decision (best-effort, audited).
- [ ] AC-5 (fail): ktayl-iam remains the access system of record — **n8n never writes Authentik directly**.

## DoD
A joiner event opens the right GLPI software tasks + an onboarding email; a leaver the reverse. Ref: sprint plan S019 · D6.
