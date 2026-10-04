---
id: S014-birthright-catalog
title: "Catalog: birthright vs on-request classification + the workspace profile"
status: Draft
type: Story
epic: iam
milestone: "IGA — Access Governance v3 (JML lifecycle)"
estimate: 5
labels: [typescript, iam, core]
priority: P1
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
initiative: IS Foundations
---

## Story
**As** the platform, **I want** every app/role classed as **birthright** or **on-request** **so that**
the lifecycle engine knows what to auto-grant on hire vs what must always be requested — encoding the
rule: _workspace = birthright, business = on-request_.

## Acceptance criteria
- [ ] AC-1: Application/Role gains an **`accessClass`** (`birthright` | `on-request`).
- [ ] AC-2: a **birthright profile** = the set of birthright roles (the digital-workplace apps).
- [ ] AC-3: seed the workspace apps (Nextcloud · mail · Matrix/Element · Jitsi · OnlyOffice · Company Portal · Vaultwarden · Docuseal) as **birthright**; everything else **on-request**.
- [ ] AC-4: an admin can edit the profile (change-audited).
- [ ] AC-5 (fail): a role with no `accessClass` defaults to **on-request** (never accidentally birthright).
- [ ] AC-6 (fail): classing a **business** app birthright requires an explicit admin action + audit row.

## DoD
The catalog cleanly answers "is this access automatic or requested?"; migration + unit tests. Ref: sprint plan S014 · the governing principle.
