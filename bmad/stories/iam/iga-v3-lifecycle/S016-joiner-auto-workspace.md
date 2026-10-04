---
id: S016-joiner-auto-workspace
title: "Joiner — auto-provision the workspace birthright (no approval); business stays requested"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v3 (JML lifecycle)"
estimate: 8
labels: [typescript, iam, core, security]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As a** new employee, **I want** my workspace (mail, files, chat, portal) to work on day one **without**
asking **so that** I'm productive immediately — while **business-app access stays something I request**.

This is the owner's governing rule made real.

## Acceptance criteria
- [ ] AC-1: on a **joiner** event → compute the birthright (workspace) set → **auto-grant** assignments (`grantedBy=system:joiner`, **no four-eyes**) → sync to Authentik → audit.
- [ ] AC-2: the new employee can use Nextcloud / mail / chat / Company Portal immediately.
- [ ] AC-3: **business/LOB/engineering apps are NOT granted** — they remain requestable via the v1 four-eyes flow.
- [ ] AC-4 (fail): **no `accessClass=on-request` group is ever auto-granted** (only birthright).
- [ ] AC-5 (fail): **idempotent** — replaying the joiner doesn't double-grant.
- [ ] AC-6 (fail): a failed sync leaves the grant pending + self-heals via reconcile (reuse v1 AVL-3).

## DoD
A brand-new employee event → workspace access live, **zero** business access; demoed end-to-end; the audit shows birthright auto-grant with no approval. Ref: sprint plan S016 · the governing principle.
