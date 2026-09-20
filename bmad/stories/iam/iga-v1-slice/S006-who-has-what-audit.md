---
id: S006-who-has-what-audit
title: "Who-has-what views + immutable audit + export"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 5
labels: [typescript, iam, security]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As an** auditor / access admin, **I want** to see who has access to what and a full history **so that**
we have access-control evidence (DORA / ISO-27001).

## Acceptance criteria
- [ ] AC-1: per-user view (all their app-roles) + per-app view (all users/roles).
- [ ] AC-2: **immutable audit** of every request / approval / grant / revoke.
- [ ] AC-3: CSV/JSON export for audit.
- [ ] AC-4 (fail): who-has-what is **admin/auditor-only** (threat T7); audit rows are append-only (threat T8).

## DoD
Audit export reconciles with Authentik; RED metrics exposed. Ref: sprint plan S006 · NFR AUD-1.
