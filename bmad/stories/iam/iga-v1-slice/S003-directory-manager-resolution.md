---
id: S003-directory-manager-resolution
title: "Directory (Authentik) + manager resolution (ERPNext HR)"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 5
labels: [typescript, iam, integration]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the approval workflow, **I want** to know who exists and who each user's manager is **so that**
requests can be routed to the correct manager for approval.

## Acceptance criteria
- [x] AC-1: read **users + groups from Authentik** (read-only) → `AuthentikClient` + `GET /api/directory/users|groups`. *(Live read needs the `ktayl-iam-svc` account granted `view_user`+`view_group` in Authentik — see Follow-ups; code + tests done.)*
- [x] AC-2: read the **manager ↔ report hierarchy from ERPNext** → `HrClient.getManagerMatricule` (Employee `reports_to`, keyed on `employee_number`=matricule). *(Live lookup gated on HR population — see Follow-ups; code + tests done.)*
- [x] AC-3 (fail): manager is **never** taken from the request payload — only from HR → `ManagerResolverService.resolveManager(matricule)` takes only the matricule; tested.
- [x] AC-4 (fail): no resolvable manager → **flagged fallback approver** (`fallback:true` + reason) → tested + verified LIVE (HR unavailable → fallback to `100001`).

## DoD
- [x] Resolver + adapters built with 12 tests (resolver unit AC-3/AC-4, HR client reports_to parsing, controller integration).
- [x] Live: `GET /api/directory/status` + `/manager/:matricule` (AC-4 fallback) verified on dev.
- [ ] **Manager lookup demoed for real employees** — DEFERRED to HR population (ERPNext has 1 employee, no `reports_to`/matricule; workers crashlooping). Ref: sprint plan S003 · NFR COR-2.

## Follow-ups (external provisioning — no code change)
- **Authentik:** grant `ktayl-iam-svc` (pk 25) `authentik_core.view_user`+`view_group` (Role→Group) → AC-1 live read.
- **ERPNext:** populate HR (employees with `employee_number`=matricule + `reports_to`) + mint an API key/secret → set `ERPNEXT_URL/API_KEY/API_SECRET` → AC-2 live lookup.
