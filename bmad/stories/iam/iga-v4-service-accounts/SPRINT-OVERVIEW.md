# ktayl-iam — IGA v4: Governed service/technical-account provisioning (IGA-06 / #79)

**Board:** Project #17 (Access Governance / IAM · IS Foundations) · **Home repo:** `ktayl-iam`
**Milestone:** `IGA — Access Governance v1` · **Epic:** IGA-06

## Why

The only way to create a `GROUP_<x>` **service account** today is an ad-hoc `ak-shell` poke on production
Authentik — ungoverned, unaudited, and **correctly blocked by the platform guardrails** (surfaced 2026-11-18
during the finance QA gate). ktayl-iam governs *human* access but has **no service-account concept**. This
sprint adds it, reusing the two hard parts that already exist.

## Reuse vs build (assessment 2026-11-19 — it's an extension, not greenfield)

- ✅ **Dual-approval workflow** (`workflow/`) — four-eyes, tested. Reused (owner + Security approver legs).
- ✅ **Authentik provisioning + reconcile** (`directory/authentik.client.ts`, `sync/`) — group memberships,
  idempotent, audited. Reused + extended (service-account user type + app-password token).
- 🔨 **Build:** the `service_account` entity, the service-account request/approval path, the Authentik
  service-account + Vault-token provisioning, recert, the UI, and the first identity.

## Stories

| ID | Title | Est | Priority |
|---|---|---|---|
| S021 | Service-account entity + migration (the non-human identity model) | 3 | P2 |
| S022 | Governed service-account request + dual-approval (reuse the workflow) | 5 | P2 |
| S023 | Provision to Authentik (service-account user + group) + credential in Vault | 5 | P2 |
| S024 | Recertification + UI + provision `ktayl-qa-finance` end-to-end (unblocks finance QA) | 5 | P3 |

## The payoff
S024 provisions **`ktayl-qa-finance`** through the governed flow — the reusable **QA regression identity** that
closes the ktayl-core finance **live-200 QA debt** (the prod promotion that went out on documented-equivalence
gets its live gate) and the "hand-mint a token" gap for every future promotion.

## Governance gate (Path-B, identity trust boundary)
Privileged non-human credentials cross a security boundary → the architecture + security review gate
(`bmad-compliance.md`) applies **before build**; record the decision in an ADR + the RACI.
