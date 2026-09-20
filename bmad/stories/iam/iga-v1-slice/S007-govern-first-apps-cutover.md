---
id: S007-govern-first-apps-cutover
title: "Cutover — govern Homer-eng / Grafana / ArgoCD through the platform"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 3
labels: [typescript, iam, adoption]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the org, **I want** the platform to take over the manual Authentik steps for the first apps **so that**
access is granted through governed request → dual-approval → sync instead of by hand.

## Acceptance criteria
- [ ] AC-1: import **Homer-eng** + Grafana + ArgoCD roles/groups into the catalog.
- [ ] AC-2: manage their access **through the platform** — grants now flow request → dual approval → sync — replacing the by-hand steps in `docs/homer-rbac-spec.md` / `docs/app-authz-bindings.md`.

## DoD
A real engineer's `homer-eng` access is granted via the platform, not by hand. Ref: sprint plan S007.
