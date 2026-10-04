---
id: S018-mover-recert
title: "Mover — recompute birthright + flag old business access for re-certification"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v3 (JML lifecycle)"
estimate: 8
labels: [typescript, iam, core]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the access owner, **I want** a position change to recompute baseline access and **review** the
old business access **so that** a mover doesn't silently accumulate entitlements across roles (the
"privilege creep" finding) — without breaking them mid-transfer.

## Acceptance criteria
- [ ] AC-1: on a **position change** → recompute birthright (workspace stays; adjust if position-based profiles exist).
- [ ] AC-2: **flag the employee's business-app grants for re-certification** (owner/manager review + a deadline) — don't silently keep or auto-revoke (D5).
- [ ] AC-3: audit the move + each recert flag.
- [ ] AC-4 (fail): a move **never** breaks workspace access.
- [ ] AC-5 (fail): un-reviewed flagged grants **escalate** after the deadline (surfaced for decision, not auto-dropped silently).

## DoD
A department change recomputes birthright + opens recert items for the old business access; verified end-to-end. Ref: sprint plan S018 · D5. (Needs v2 approver login for the recert action.)
