---
id: S015-hr-event-intake
title: "HR-event intake — ERPNext Employee lifecycle → ktayl-iam (greenfield)"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v3 (JML lifecycle)"
estimate: 8
labels: [typescript, iam, integration]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the platform, **I want** to receive HR lifecycle events from ERPNext **so that** access can react
automatically to Joiner / Mover / Leaver — the trigger for the whole event-driven model.

> **Greenfield** — ERPNext emits nothing to ktayl-iam today (0 HR workflow activity verified).

## Acceptance criteria
- [ ] AC-1: a Frappe **Webhook** on `Employee` (create / update / relieve) posts to a **signed** `POST /api/lifecycle/events`.
- [ ] AC-2: the event normalizes to `{type: joiner|mover|leaver, matricule, job, dept, country, entity}`.
- [ ] AC-3: **idempotent** — replaying an event is safe; events are processed **in order per employee**.
- [ ] AC-4: a scheduled **poll-reconcile** re-derives lifecycle state from ERPNext so a **missed webhook self-heals** (D1).
- [ ] AC-5: every event is audited.
- [ ] AC-6 (fail): an unsigned/forged event is rejected; an unknown matricule is flagged, not fatal.

## DoD
Creating / relieving an employee in ERPNext produces a recorded, normalized lifecycle event in ktayl-iam. Ref: sprint plan S015 · D1.
