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
- [x] AC-2: read the **manager ↔ report hierarchy from ERPNext** → `HrClient.getManagerMatricule` (Employee `reports_to`, keyed on `employee_number`=matricule). **LIVE** — verified from the backend pod: manager(100003)=100002, manager(100004)=100002, manager(100002)=100001, manager(100001)=null→fallback.
- [x] AC-3 (fail): manager is **never** taken from the request payload — only from HR → `ManagerResolverService.resolveManager(matricule)` takes only the matricule; tested.
- [x] AC-4 (fail): no resolvable manager → **flagged fallback approver** (`fallback:true` + reason) → tested + verified LIVE (HR unavailable → fallback to `100001`).

## DoD
- [x] Resolver + adapters built with 12 tests (resolver unit AC-3/AC-4, HR client reports_to parsing, controller integration).
- [x] Live: `GET /api/directory/status|manager/:matricule` wired + guarded (401 unauth) on dev.
- [x] **Manager lookup demoed for real employees** — a 4-person ERPNext org chart (100001 Andre → 100002 Marie → 100003 Paul / 100004 Sophie); backend resolves the chain live. Ref: sprint plan S003 · NFR COR-2.

## Enablement done this session
- **ERPNext HR populated** (bench) with the 4-person chart; `employee_number`=matricule, `reports_to` chain.
- **ERPNext creds:** `ktayl-iam-svc` ERPNext user (HR User, read-only) + API key → Vault `platform/ktayl-iam` → ExternalSecret → `ERPNEXT_API_KEY/SECRET`; `ERPNEXT_URL=https://erp.devandre.sbs`.
- **Reachability:** added `erp.devandre.sbs → 10.0.0.200` to `coredns-custom` (it was missing) so the backend reaches ERPNext via ingress (erp netpol only allows ingress-nginx, not direct pod-to-pod).
- **Fixed a pre-existing ERPNext incident:** `sites/common_site_config.json` was 0 bytes (truncated in the 2026-09-21 Longhorn/RO-FS window) → bench + all workers crashlooping + web 500s; reconstructed it (db/redis/socketio) → ERPNext fully recovered.

## Follow-up (external provisioning — no code change)
- **Authentik AC-1 live read:** grant `ktayl-iam-svc` (pk 25) `authentik_core.view_user`+`view_group` (Role→Group) → `/api/directory/users|groups` returns live data (code + tests done; svc token is currently group-write-scoped for S005).
