---
id: S002-app-role-catalog
title: "Data model + application/role catalog (source of truth)"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 5
labels: [typescript, iam, database]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As an** access admin / app owner, **I want** to register each application and the roles it has **so that**
there is one source of truth for what roles exist and who owns them.

## Acceptance criteria
- [ ] AC-1: schema `application` (name, tier, authentik-app-ref) · `role` (name, **owner**, authentik-group-ref) · `assignment` · `request` · `audit_log`.
- [ ] AC-2: admin UI + API to register an application and its roles.
- [ ] AC-3: each Role maps to a named Authentik group.
- [ ] AC-4 (fail): a Role **must have an owner** (approver #2) before it can be requested.

## DoD
≥3 real apps catalogued (Homer-eng, Grafana, ArgoCD) with roles + owners. Ref: sprint plan S002.
