---
id: S008-multi-user-auth
title: "Multi-user authentication — admit any authenticated employee (drop admin-only login)"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v2 (multi-user)"
estimate: 5
labels: [typescript, iam, security]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As an** employee (not an admin), **I want** to sign into the Access Governance console **so that** I
can request roles and approve the ones I'm responsible for — instead of the console being admin-only.

## Context
The admin-only gate is purely in the app (`oidc.strategy.ts` → `authorizeFromVerifyArgs` throws unless
in `ADMIN_GROUP`). The Authentik Application has **no policy binding**, so Authentik already issues
tokens to any user → this is a backend-authz change, no Authentik reconfig.

## Acceptance criteria
- [ ] AC-1: a non-admin Authentik user completes OIDC login and gets a session (no longer 401 at the gate).
- [ ] AC-2: `AuthUser` carries `isAdmin` (derived from `ADMIN_GROUP` membership) + the resolved matricule.
- [ ] AC-3: the global `AuthenticatedGuard` still requires a session on every non-`@Public()` route.
- [ ] AC-4 (fail): login is gated on the **birthright group** (D1) — a user in neither staff nor admin is rejected with a clear message.
- [ ] AC-5 (fail): no former admin route is left open by removing the login gate — **land with S009** (authz) so nothing is briefly wide-open.

## DoD
A non-admin logs into dev and reaches a (scoped) console; admin still `isAdmin`. Unit tests:
admit-non-admin, reject-outsider, isAdmin-true/false. Ref: sprint plan S008 · D1.
