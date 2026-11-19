---
id: S021
title: "Service-account entity + migration (the non-human identity model)"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 3
labels: [iam, backend, database, security]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
---

## Story

As an **IGA engineer**, I want a first-class **service-account** entity (distinct from the human `identity`
model) so that non-human identities can be requested, approved, provisioned and recertified by the existing
governance machinery.

## Background

Everything in ktayl-iam today is keyed by **matricule** (a human from HR). A service account has no HR record,
no manager, no mailbox. It needs its own entity so the workflow/sync/audit code can treat it as a governed
subject without faking an HR identity. (IGA-06; assessment 2026-11-19 — `lifecycle/entities/identity.entity.ts`
is human-only.)

## Acceptance Criteria

- [ ] **AC-1** — a `service_account` TypeORM entity + migration (`src/database/migrations/`, `synchronize:false`):
      `id` (uuid pk), `name` (unique, the Authentik username, e.g. `ktayl-qa-finance`), `displayName`,
      `type` (enum: `qa` | `m2m` | `automation`), `ownerMatricule` (the human accountable owner → an existing
      `identity`), `status` (`requested` | `active` | `disabled`), `authentikUsername` (nullable until
      provisioned), `vaultSecretRef` (nullable; where the credential lives), `createdBy`, `createdAt`,
      `lastRecertifiedAt` (nullable). No credential value stored in the DB.
- [ ] **AC-2** — a `service_account_group` link (or a `groupRefs` column) capturing the Authentik group(s) the
      account is a member of (e.g. `Finance`) — the `GROUP_<name>` authority it will carry.
- [ ] **AC-3** — a repository + a thin `ServiceAccountService` (create/find/list/updateStatus) with no business
      rules beyond persistence (the workflow owns the lifecycle). An append-only `audit_log` entry on create.
- [ ] **AC-4** — the migration `down()` cleanly drops the table(s); schema stays migration-owned.

## Technical Notes
- Mirror the existing entity style (`catalog/entities/*.entity.ts`); keep it in a new `service-accounts/`
  module (or under `catalog/`), consistent with the module layout.
- `ownerMatricule` FK to `identity` (the human who answers for the account — recert + revoke target).
- Do **not** reuse `identity` (matricule PK, HR fields) — a service account is a different subject.

## Definition of Done
- [ ] Entity + migration + repo + service; Vitest unit test (create → persisted + audited); `npm run db:migrate`
      applies clean; `down()` reverses it. No secret material in the entity.

## Dependencies
- Blocks: S022 (the request references a `service_account`), S023 (provision sets `authentikUsername`/`vaultSecretRef`).
