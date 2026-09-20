# ktayl-iam

> **A custom-built access-governance platform** for the ktayl-solution IS — on top of **Authentik** (the IdP/directory, our "Entra"), it manages **per-application roles + user assignments**, runs **dual-approval (manager + role owner) access requests**, and **provisions Authentik groups** so login enforces them. Role/entitlement management, certification, SoD. Design: [`docs/`](docs/) (brief · PRD · architecture · access-role-model · ADRs).

**Product board:** https://github.com/orgs/andrelair-platform/projects/17
**Initiative:** IS Foundations · **Layer:** ktayl-solution IS · **Platform docs:** https://andrelair-platform.github.io/minicloud-platform-docs/

BMAD stories live in `bmad/stories/` and sync to Issues on **Project #17** via the org-shared reusable workflow.

## Repository structure

```
backend/    NestJS API — domain logic, dual-approval workflow, Authentik-sync engine  (TypeScript)
frontend/   Next.js admin UI — app catalog, role editor, requests/approvals, who-has-what
docs/       design set (brief · prd · architecture · access-role-model · ADRs · sprint plan)
bmad/       stories → board #17
```

Datastore = PostgreSQL. Auth = Authentik OIDC (the platform never re-implements login). Stack rationale: ADR-006.

## Getting started (local dev)

```bash
# backend
cd backend && npm install && npm run start:dev   # http://localhost:3000
# frontend
cd frontend && npm install && npm run dev         # http://localhost:3000 (set a different port)
```

> **Build gate = CI** (clean environment). A known npm resolver bug on some dev boxes can block a local
> `npm install` for the backend; CI (`.github/workflows/ci.yml`) installs + builds both apps cleanly.

## Epic backlog

| ID | Epic | Priority |
|---|---|---|
| IGA-01 | Access Governance platform (custom) — request → **dual approval (manager + role owner)** → provisioning to Authentik | P1 |
| IGA-02 | Role & entitlement model across business applications | P1 |
| IGA-03 | Access certification / recertification campaigns | P2 |
| IGA-04 | SCIM provisioning to business apps | P2 |
| IGA-05 | Segregation of Duties + access audit | P2 |

## License
MIT — see [LICENSE](LICENSE).
