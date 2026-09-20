# Solution Architecture — ktayl Access Governance Platform (#17)

> **BMAD/SA artefact (index).** How the **custom-built** access-governance platform fits: it sits on top of
> **Authentik** (the directory + enforcement) and is the **system of record** for "who has which role in
> which app", pushing that into Authentik. **Status: DRAFT for review.**

## 1. Overview

Authentik is the **IdP / directory** (the "Entra") — it authenticates everyone and **enforces** access at
login via groups. Our platform is the **governance/administration layer** on top: it models
**Applications → Roles → user assignments**, runs request/approval, and **writes the resulting groups +
memberships into Authentik** so login enforces them. We **build** this; we do not re-implement auth.

## 2. Context (C1)

```
   Employees ──login (SSO)──► Authentik ─────────────────► every app (groups gate access)
                                 ▲   (IdP · directory · enforcement)
                                 │  Authentik API: create/update groups + memberships  (WRITE)
                                 │  read the employee directory                        (READ)
   Admin / app owner / approver  │
        │  browser (SSO)         │
        ▼                        │
   ┌─────────────────────────────┴───────────────────────────┐
   │  ktayl-iam Access Governance Platform  (WE BUILD THIS)   │
   │  NestJS API + Next.js admin UI + PostgreSQL              │
   │  source of truth: App ▸ Role ▸ Assignment ▸ audit        │
   └─────────────────────────────┬───────────────────────────┘
                                 │ governs first:
                                 ▼
              Homer portals + per-app access (app-authz-bindings)
```

External dependencies = **Authentik** (directory + enforcement — the platform *feeds* it, never bypasses it)
and **ERPNext / HR** (the **manager ↔ report** org hierarchy, so the platform can route **manager approval**
in the dual-approval flow — ADR-007).

## 3. Container view (C2)

| Container | Tech | Responsibility |
|---|---|---|
| **Admin UI** | Next.js + React | app catalog, role editor, assign/revoke, requests/approvals, who-has-what |
| **API** | NestJS (TypeScript) | domain logic, request→approval workflow, audit, authz for the platform itself |
| **Authentik sync engine** | NestJS module | on grant/revoke, idempotently create/update Authentik **group + membership** via the Authentik API; **reconcile** drift |
| **DB** | PostgreSQL | source of truth: `application`, `role`, `assignment`, `request`, `audit_log` |
| **Directory reader** | NestJS module | list users/groups from Authentik (read-only) |

Why **NestJS + Next.js** (ADR-006): one language across API + workflow + UI, structured/DI, fits a
CRUD+workflow+integration admin app.

## 4. Key flows

1. **Register app + roles:** app owner adds an Application (+ tier + Authentik ref) and its Roles (each Role
   ↔ an Authentik group name).
2. **Assign a role:** admin assigns *user U → role R in app A* → DB assignment written → **sync engine adds
   U to the Authentik group** for (A,R) → next login U is authorized. Revoke = remove membership.
3. **Request → DUAL approval → provision (four-eyes):** U requests role R in app A →
   ```
   request ─► approval #1: U's MANAGER      ┐
           └─ approval #2: ROLE OWNER        ├─ BOTH approve ─► provision (flow 2) ─► access granted
                                             │  EITHER denies ─► rejected, nothing granted
   ```
   Order-independent; separation-of-duties enforced (requester can't approve their own; self-manager/
   self-owner reassigns to a backup). Provisioning to Authentik happens **only after both approvals** —
   never on one. Manager is resolved from the HR org hierarchy (ERPNext); role owner is on the Role.
4. **Reconcile:** a scheduled job diffs DB assignments vs Authentik group memberships → re-applies (heals
   drift, e.g. a membership changed by hand).
5. **Audit:** every grant/revoke/approve writes an immutable `audit_log` row → who-has-what export.

## 5. Where enforcement lives (important)

- **Authentik enforces** (login time, per app — the same group→application policy from
  [app-authz-bindings](../app-authz-bindings.md)). The platform **does not** sit in the request path.
- **The platform decides + records** (the system of record for entitlements) and **provisions** Authentik.
- So if the platform is down, **already-granted access still works** (Authentik holds the groups); only
  *new* grants/changes pause until it's back. No availability coupling to live traffic.

## 6. Integration & security principles
- **Never re-implement auth** — Authentik is the only IdP; the platform's own admins log in via Authentik OIDC.
- **Least-privilege Authentik API token** (manage groups/memberships only) via **ESO→Vault**; never in Git.
- **The platform is high-value** (it grants access) → hardened, audited, default-deny egress (only Authentik API + DB), admin-only.
- **Idempotent sync + reconcile** — a grant applied twice = one membership; drift is healed, never silently lost.
- **Deployment** = GAP wrapper chart (dev+prod), Kargo promotion, like the other custom services.

## 7. Cross-references
[Brief](../brief.md) · [PRD](../prd.md) · [Access Role & Tier Model](../access-role-model.md) (the data it
manages) · [Homer RBAC](../homer-rbac-spec.md) + [App authz bindings](../app-authz-bindings.md) (first apps
governed) · [NFR](./nfr-register.md) · [Threat Model](./threat-model.md) · [ADRs](./adr/000-index.md).
