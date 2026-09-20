# PRD — ktayl Access Governance Platform (#17)

> **BMAD artefact — PRD.** The product contract for the **custom-built** access-governance platform.
> **Status: DRAFT for review.**

## 1. Problem & goal

Give the IS a **governed way to grant per-application roles**: every app declares its roles, an admin
assigns each user the role they need, and the decision is **enforced at login via Authentik**. Build it
ourselves (custom app), with Authentik as the directory + enforcement point.

## 2. Core concept (the data model)

```
Application  (e.g. Grafana, ktayl-claims, Homer-eng)
   └── has Roles      (e.g. viewer / admin ; handler / senior / read-only)
          └── Assignment: User ↔ (Application, Role)   ← the platform is the source of truth
                 └── syncs to an Authentik Group  ← Authentik enforces it at login
```

- **Application** — a registered system in the IS (name, tier Public/Internal/Restricted, its Authentik application ref).
- **Role** — a named entitlement *within* an application (maps to an Authentik group + optionally an in-app role); **each role has an _owner_** (approver #2).
- **Assignment** — user has role R in app A (with grant reason, requester, **both approvers**, expiry).
- **Request** — a pending assignment awaiting **dual approval** (manager + role owner).
- **User + manager** — users come from **Authentik** (directory, read). Each user has an immutable
  **matricule** — a **6-digit employee ID** (from **ERPNext HR**), which **is the Authentik username**
  (login = the matricule) and the platform's **business key**; the technical PK stays the Authentik `sub`
  (see [ADR-008](./architecture/adr/000-index.md#adr-008)). Email + display name stay human-readable. Each
  user's **manager** (approver #1) comes from **ERPNext** (the org hierarchy), so the platform can route manager approval.
- **Directory** — the platform does **not** re-implement authentication; Authentik owns login.

## 3. In scope (v1)

| # | Capability |
|---|---|
| Application catalog | register apps + owner + tier + Authentik ref |
| Role definitions | per-app roles, each mapped to an Authentik group |
| Assignments | grant/revoke a user a role in an app (source of truth in the platform DB) |
| **Authentik sync** | on grant/revoke, create/update the Authentik **group + membership** via the Authentik API |
| Access request → **dual approval** | a user requests a role → **manager AND role owner** both approve (four-eyes) → then it provisions; either denial stops it |
| Who-has-what view | per-user and per-app views; export for audit |
| Governs Homer + apps | the Homer portals + per-app gates ([app-authz-bindings](./app-authz-bindings.md)) are the first managed apps |

## 4. Out of scope (v1)
Recertification campaigns (IGA-03) · SCIM to business apps beyond Authentik (IGA-04) · SoD rules engine
(IGA-05) · PAM · data-level authz inside apps · a public self-service portal (admin-first v1).

## 5. Functional requirements
- **FR-1** Read the employee directory from **Authentik** (OIDC login for the platform's own admins; users listed from Authentik).
- **FR-2** CRUD **Applications** + their **Roles**; each Role maps to a named **Authentik group**.
- **FR-3** **Assign / revoke** a user a role in an app → the platform **writes the Authentik group membership** (idempotent) so login enforces it.
- **FR-4** **Request → DUAL approval → provision** (four-eyes, mandatory): a user requests a role in an app →
  it requires **two independent approvals — the user's _manager_ AND the _role owner_** — before anything is
  granted. Rules:
  - **Both must approve** (order-independent); **either denial** ends the request (no access).
  - Access is **provisioned to Authentik (FR-3) only after both approvals** — never on a single approval.
  - **Separation of duties:** requester ≠ approver; if the requester *is* the manager or role owner, that
    approval is reassigned (e.g. to the manager's manager / a backup owner) — no self-approval.
  - Each approval step is **recorded** (approver, decision, timestamp, comment) → the audit trail (FR-6).
  - Optional **expiry** on the grant → lapses automatically (re-request needed).
- **FR-5** **Who-has-what**: per-user (all their app-roles) + per-app (all users/roles) + an audit export.
- **FR-6** Every grant/revoke/approval is **audit-logged** (who, what, when, why) — immutable.
- **FR-7** **Reconcile**: detect drift between the platform's assignments and Authentik groups; re-apply.

## 6. Non-functional ([NFR register](./architecture/nfr-register.md))
Security (the platform holds authz decisions → hardened, least-privilege Authentik API token, audit),
availability (a grant should provision in seconds), correctness (idempotent sync, no lost membership),
observability, backup/DR of the assignment DB (the source of truth).

## 7. Compliance (Track-B gate)
- **DORA / ISO-27001** — access control + least privilege + audit trail (this platform *is* the evidence).
- **GDPR** — it processes employee identity data → minimisation + retention + access control.
- **RNCP** — BC02 (concevoir a real product) + BC03 (déployer & sécuriser).

## 8. Technology (ADR-006)
**Custom build:** **NestJS** (API + workflow + Authentik-sync engine) · **Next.js + React** (admin UI) ·
**PostgreSQL** (assignment source of truth) · **Authentik API** (write groups/memberships; read directory).
Deployed as a **GAP wrapper chart**; secrets via ESO→Vault; SSO via Authentik. Authentik stays the IdP +
runtime enforcement; this platform is the **governance/administration layer** (system of record for
entitlements).

## 9. Success metrics
An admin grants a user a role in an app and it's enforced at login **without touching Authentik by hand**;
Homer + ≥3 apps governed through the platform; a who-has-what export exists; every change is audit-logged.

## 10. Dependencies
Authentik (directory + API + enforcement) · **ERPNext / HR (manager ↔ report org hierarchy, for manager
approval — FR-4)** · Vault/ESO (the Authentik API token + DB creds) · `minicloud-gitops` (deployment) ·
the [access role model](./access-role-model.md) (the entitlement data it manages).
