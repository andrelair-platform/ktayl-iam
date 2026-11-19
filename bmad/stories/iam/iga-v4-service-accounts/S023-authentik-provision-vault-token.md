---
id: S023
title: "Provision the service account to Authentik + store its credential in Vault"
status: Ready
type: Story
epic: iam
milestone: "IGA — Access Governance v1"
estimate: 5
labels: [iam, backend, security]
priority: P2
assignee: AndreLiar
repo: andrelair-platform/ktayl-iam
project: 17
---

## Story

As the **IGA system**, I want an approved service-account request to **create the account in Authentik**
(as a service-account-type user, in its group) and **store its credential in Vault**, so that the account is
usable for M2M/QA while its secret never touches the DB, a transcript, or git.

## Background

The `AuthentikClient` + `SyncService` already provision **group memberships** idempotently with a reconcile
job (`sync/sync.service.ts`). What's missing: creating an Authentik **service-account** user (not a human
`internal` user) and minting + storing an **app-password token** (the credential an M2M client-credentials
call uses). This is the exact capability the ad-hoc `ak-shell` poke did — now governed + audited. (IGA-06;
the ak-shell path was guardrail-blocked 2026-11-18.)

## Acceptance Criteria

- [ ] **AC-1** — extend the Authentik adapter with `ensureServiceAccount(username, displayName)` (Authentik
      user `type: service_account`, idempotent) — distinct from the human `ensureUser`. On approval (S022),
      the sync path calls it + `addUserToGroup(username, groupRef)` for each requested group, then sets the
      `service_account` to `active` with its `authentikUsername`.
- [ ] **AC-2** — mint a **non-interactive credential** (Authentik app-password token for the service account)
      and write it to **Vault** at a deterministic path (e.g. `secret/platform/service-accounts/<name>`); store
      only the **`vaultSecretRef`** on the entity, never the token value. Use the existing **least-privilege**
      token split (the elevated credential token, like S016), not the group-only sync token.
- [ ] **AC-3** — **idempotent + reconcilable**: re-running provision is a no-op; the hourly reconcile keeps the
      group membership (DB authoritative) as it does for humans. A provision failure sets `lastSyncError` and is
      retried/healed, never a half-provisioned silent state.
- [ ] **AC-4** — the minted token is **short-lived or rotatable by policy** (v1: an expiring app-password;
      rotation is a later story) and the issuance is audited (`service_account.provisioned` with the group(s) +
      the vault ref, never the secret).
- [ ] **AC-5** — a **disable/revoke** path: disabling a service account removes its group memberships
      (`removeUserFromGroup`) and disables the Authentik user (`disableUser`), audited — the governed teardown.

## Technical Notes
- Reuse `SyncService.provision/revoke` + the reconcile; add the service-account user-creation + token steps.
- Vault write: mirror the platform ESO→Vault convention; the write uses the elevated token (not committed) —
  verify the path is readable by an ESO ExternalSecret so a consumer can mount it.
- Authentik service-account creation + client-credentials: see `authentik-app-onboarding` (§B M2M) — the
  minted token is the `client_secret` in a `grant_type=client_credentials` call; the account's group → the
  `groups` claim → the `GROUP_<name>` authority on the consumer.

## Definition of Done
- [ ] Vitest unit + e2e (Authentik + Vault clients mocked/contract-tested): approval → Authentik
      service-account + group + Vault ref; idempotent re-run; failure sets `lastSyncError`; revoke tears down.
      No secret value in DB/logs/tests.

## Dependencies
- Depends on: S021 + S022. Blocks: S024 (the `ktayl-qa-finance` end-to-end demo mints a real token).
