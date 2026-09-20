# Product Brief — Access Governance (IAM/IGA) (#17)

> **BMAD artefact — BRIEF.** Frames the access-governance need. **Status: DRAFT for review.**

## The need (concrete trigger)

Every platform user today, once through Authentik SSO, can **see and reach every tool** — a business
user and a platform engineer get the *same* view (e.g. the Homer portal lists ArgoCD, Vault, Grafana,
Harbor next to Mail and ERPNext). There is **authentication** (SSO) and **network segmentation**
(Tailscale for the internal tier), but **no role-based authorization**: no notion of "a business user
gets business apps; an engineer gets the engineering platform." That is an **access-governance gap**, and
it is exactly what **IAM/IGA #17** owns — not a per-app hack.

## Why identity is the control here (BYOD)

ktayl is **BYOD — no managed endpoints** (`project-governance.md` *IS scope boundaries*): the perimeter
**is identity**. So a **role & entitlement model** enforced at the identity layer isn't a nice-to-have —
it's the *primary* control. Getting it right is the point of #17.

## What this brief scopes

The **role & access-tier model** (IGA-02) + its **runtime enforcement** (Authentik groups today,
MidPoint IGA as the governing source of truth) — with the **Homer portal split into role-based views** as
the **first, visible application** of the model. It answers: *who is allowed to see/use what, and how is
that decided, granted, and proven?*

## Personas (the roles the model must express)

- **Business user** — insurance staff (underwriting, claims, finance, compliance ops, servicing): business
  apps only.
- **Developer · DevOps/Platform · Data engineer · SRE** — the **engineering** roles that need the internal
  platform (ArgoCD, Grafana, Vault, Harbor, observability, AI-ops).
- **Admin / break-glass** — everything incl. restricted tools.

## v1 outcome

A **defined role model** (personas → access tiers → entitlements → Authentik groups), enforced so that
**Homer shows a business user only their business + public apps, and the internal engineering platform is
visible/reachable only to engineer roles** — with the same groups gating the underlying apps
(defense-in-depth), and a path to MidPoint-governed request/approval/recertification.

## Out of scope (v1)
Full MidPoint request-workflow build (IGA-01, later) · SCIM to every app (IGA-04, later) · SoD analytics ·
PAM (IGA-05) · per-record data-level authz inside apps (that's each domain's own concern).

## Why now
It's the **primary control** for a BYOD IS, it's the correct home for the Homer RBAC ask, and it produces
**BC03 (déployer & sécuriser)** + DORA/ISO-27001 access-control evidence.
