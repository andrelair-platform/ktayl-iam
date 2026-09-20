---
id: S001-platform-scaffold-sso
title: "Platform scaffold + deploy + SSO (NestJS + Next.js + Postgres)"
status: In Progress
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 5
labels: [typescript, iam, devops, security]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As a** platform engineer, **I want** the Access Governance app deployed empty-but-real behind SSO **so that**
we have a running, secured foundation to build the governance features on.

## Acceptance criteria
- [ ] AC-1: NestJS API + Next.js UI build in CI (cosign-signed + SBOM + Trivy CRITICAL gate).
- [ ] AC-2: GAP wrapper chart `services/ktayl-iam/helm/` renders; dev app Healthy in ArgoCD.
- [ ] AC-3: **admin-only** login via Authentik OIDC (no local auth).
- [ ] AC-4 (fail): DB creds + the Authentik API token come from **ESO→Vault** — none in Git/images.
- [ ] AC-5 (fail): default-deny egress — only Authentik API + Postgres reachable.

## DoD
Dev reachable behind SSO; Postgres backup wired (DR-1). Ref: `docs/iga-v1-sprint-plan.md` S001 · ADR-006.
