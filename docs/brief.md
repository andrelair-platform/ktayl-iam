# Product Brief — ktayl Access Governance Platform (#17)

> **BMAD artefact — BRIEF.** Frames the business need. **Direction: a CUSTOM-BUILT access-governance
> platform on top of Authentik** (not an off-the-shelf IGA install). **Status: DRAFT for review.**

## The model in one line

**Authentik is our "Entra"** — the directory + login (SSO) where **every employee** lives. On top of it we
**build our own platform** that decides **which role a person gets in each application**, and pushes that
decision into Authentik so login enforces it.

```
   every employee ──> Authentik (directory + SSO + enforcement)   ← the "Entra"
                          ▲  groups/roles pushed in
                          │
   we BUILD this ──> ktayl-iam Access Governance Platform (custom app)
                     "each app has roles → give each user the role they need for that app"
```

## The need (concrete trigger)

Today, once a user is through Authentik SSO they can reach **every tool** — there is authentication but no
**per-application authorization by role**. We fixed the visible symptom on the Homer dashboard (the
[two-portal split](./homer-rbac-spec.md)), but the real need is a **governed way to say, for every app,
who has which role and why** — and to grant/revoke it in one place. That is **access governance (IGA)**,
and #17 owns it.

## What we're building (and what we're NOT)

- **We ARE building** a custom platform (a real app: API + admin UI + database) that models
  **Applications → their Roles → user assignments**, runs **request → approval**, shows **"who has what"**,
  and **syncs the result into Authentik groups** (which enforce at login).
- **We are NOT** installing an off-the-shelf enterprise IGA suite (e.g. MidPoint). We build our own — it
  fits how the rest of the IS is built, it's a strong portfolio piece, and it's exactly the "make an
  application role-aware and give users the rights they need" capability we want. (MidPoint is recorded as
  the buy-instead alternative in [ADR-006](./architecture/adr/000-index.md#adr-006).)

## Why identity is the control here (BYOD)

ktayl is **BYOD — no managed endpoints** (`project-governance.md`): the perimeter **is identity**. So a
governed role model at the identity layer is the **primary** control, not a nice-to-have.

## v1 outcome (the thin slice)

**Register an app + its roles → a user requests a role → it is _double-validated_ (the user's manager AND
the role owner) → only then the platform creates/updates the matching Authentik group + membership → login
now enforces it**, with a **"who has what"** view and a full audit trail. The **Homer portals + per-app
access** ([app-authz-bindings](./app-authz-bindings.md)) are the **first apps it governs**.

> **Dual approval is a core control, not a nice-to-have** — no role reaches Authentik on a single sign-off
> (four-eyes: manager + role owner). See [ADR-007](./architecture/adr/000-index.md#adr-007).

## Out of scope (v1)
Full request-workflow bells & whistles · SoD analytics (IGA-05) · SCIM to every business app (IGA-04, later)
· recertification campaigns (IGA-03, later) · PAM · per-record data-level authz inside apps (each domain's own concern).

## Users
Admin / access owner (grants roles) · app owners (declare an app's roles) · approvers · every employee
(requests access) · auditor (who-has-what evidence).

## Why now
It's the **primary control** for a BYOD IS, the correct home for the Homer RBAC ask, a **custom build** that
suits our portfolio, and it produces **BC02 (concevoir) + BC03 (déployer & sécuriser)** + DORA/ISO-27001
access-control evidence.
