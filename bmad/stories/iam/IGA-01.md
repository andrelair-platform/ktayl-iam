---
id: IGA-01
title: "EPIC: IGA platform (MidPoint) — request → approval → provisioning"
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

IGA platform (MidPoint) — request → approval → provisioning.

## Why
Habilitation management: access request → manager approval → Authentik SCIM provisioning (issue #205).

## Scope (epic-level)
- [ ] MidPoint IGA deployed + integrated with Authentik
- [ ] Access-request workflow with manager approval
- [ ] SCIM provisioning to target apps on approval
- [ ] Deprovision on leaver
- [ ] Audit trail of every grant
