---
id: S002-app-role-catalog
title: "Data model + application/role catalog (source of truth)"
status: Done
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
- [x] AC-1: schema `application` (name, tier, authentik-app-ref) · `role` (name, **owner**, authentik-group-ref) · `assignment` · `request` · `audit_log`. → `backend/src/catalog/entities/*` + migration `InitCatalog`.
- [x] AC-2: admin UI + API to register an application and its roles. → `CatalogController` (`/api/applications` + `/:id/roles`) + `frontend/src/app/admin`.
- [x] AC-3: each Role maps to a named Authentik group. → `role.authentikGroupRef` (required).
- [x] AC-4 (fail): a Role **must have an owner** (approver #2) before it can be requested. → NOT NULL column + DTO `@Length(1)` + service guard; tested (unit + HTTP 400).

## DoD
- [x] ≥3 real apps catalogued (Homer-eng, Grafana, ArgoCD) with roles + owners → seed migration `SeedCatalogApps`.
- [x] Tests: 13 catalog tests (service unit + controller integration); audit row per mutation. Ref: sprint plan S002.

## Notes
- `assignment` / `request` are schema-only here (their lifecycle is S004/S006); `audit_log` is written on every catalog mutation.
- Owner = matricule (directory-validated in S003); seed owner `100001` = platform admin.
