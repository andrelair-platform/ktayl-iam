---
id: IGA-01
title: "EPIC: Access Governance platform (custom) — request → dual approval → provisioning"
status: Ready
type: Epic
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 13
labels: [epic, iam]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
---

## Epic

**Custom-built** Access Governance platform (NestJS + Next.js + Postgres) on top of Authentik —
request → **dual approval** → provisioning. See `docs/` (brief · PRD · architecture · ADR-006/007).

## Why
Habilitation management: each app has roles; a user requests the role they need → **double validation
(manager + role owner)** → the platform provisions the Authentik group + membership so login enforces it.
Authentik = IdP + enforcement; this platform = the governance/source-of-truth layer. **Not MidPoint** (custom build, ADR-006).

## Scope (epic-level)
- [ ] Application catalog + per-app Roles (each Role ↔ an Authentik group; each Role has an owner)
- [ ] Access-request workflow with **dual approval — manager (from ERPNext org hierarchy) AND role owner** (four-eyes, ADR-007)
- [ ] **Authentik sync engine** — provision group + membership only after both approvals (idempotent + reconcile drift)
- [ ] Who-has-what view + immutable audit trail of every grant/approval
- [ ] Deprovision on revoke / leaver
