# Threat Model — ktayl Access Governance Platform (#17)

> **BMAD/SA artefact — STRIDE-lite.** This platform *grants access*, so it is a high-value target: a
> compromise = arbitrary access to any app. **Status: DRAFT for review.**

## Trust boundaries
1. **Admin/approver → platform UI/API** (SSO edge).
2. **Platform → Authentik API** (writes groups/memberships — the privileged action).
3. **Platform → Postgres** (the entitlement source of truth).
4. **Platform → ERPNext/HR** (reads the manager hierarchy).
5. **Authentik → apps** (the actual enforcement, already covered by [app-authz-bindings](../app-authz-bindings.md)).

## Top threats + mitigations
| # | STRIDE | Threat | Mitigation | NFR |
|---|---|---|---|---|
| T1 | Elevation | **Self-approval** — requester approves their own role | requester ≠ approver server-side; **dual approval** (manager + owner); self-manager/owner reassigns (ADR-007) | SEC-3/4 |
| T2 | Spoofing | **Forged approval** (fake a manager/owner decision) | approvers authenticate via Authentik; approval bound to the authenticated identity; audit | SEC-1/6 |
| T3 | Spoofing | **Wrong manager** approves (manager relationship faked) | manager resolved from **ERPNext HR** (authoritative), never from the request payload | COR-2 |
| T4 | Elevation | **Compromised Authentik API token** → attacker grants any group | least-privilege token (groups only), ESO→Vault, rotate, egress netpol to Authentik only | SEC-2/5 |
| T5 | Tampering | **Direct edit of an Authentik group** (bypass the platform) | **reconcile** detects + reverts drift + alerts; Authentik admin restricted (devops/admin, ADR-003) | AVL-4 |
| T6 | Tampering | **Assignment DB tampered** | DB access-controlled (app creds only), audited, backed up | SEC-6, DR-1 |
| T7 | Info disclosure | **Who-has-what** (a map of all access) leaks → recon | admin/auditor-only; not exposed to end users | SEC-1 |
| T8 | Repudiation | "I never approved that" | immutable, attributable audit of every step | AUD-1 |
| T9 | Elevation | **Break-glass abuse** (`ktayl-admin` bypasses dual approval) | sealed, alerted on use, heavily audited; reviewed | AUD-2 |
| T10 | Supply chain | malicious dep in the custom app | cosign + SBOM + Trivy CRITICAL gate; pinned deps | SEC-7 |
| T11 | DoS | request/approval flood | rate-limit; admin-only surface | SEC-1 |

## Security-gate blockers (must be true before prod)
- **T1/T4** dual approval + no self-approval enforced server-side; least-privilege Authentik token in Vault.
- **T3** manager sourced from HR, not user input.
- **T5** reconcile + drift alerting live.
- **T8/T9** immutable audit + break-glass alerting.
