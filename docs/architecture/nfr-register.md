# NFR Register — ktayl Access Governance Platform (#17)

> **BMAD/SA artefact.** PRD NFRs made **measurable**. This platform **grants access**, so security +
> correctness dominate. **Status: DRAFT for review.**

## Security (paramount)
| ID | NFR | Target |
|---|---|---|
| SEC-1 | Platform login | Authentik OIDC + MFA; **admin/approver only** (not a public app) |
| SEC-2 | Authentik API token | **least-privilege** (manage groups/memberships only), via **ESO→Vault**, rotatable, none in Git |
| SEC-3 | No self-approval | requester ≠ approver enforced **server-side** (SoD, ADR-007) |
| SEC-4 | Dual approval enforced server-side | a grant provisions **only** with manager **and** role-owner approval — never client-trust, never one |
| SEC-5 | Network | default-deny egress; only **Authentik API + Postgres + ERPNext (HR)**; ingress SSO-only |
| SEC-6 | Audit immutability | every request/approval/grant/revoke append-only, tamper-evident |
| SEC-7 | Supply chain | cosign-signed + SBOM images; Trivy CRITICAL gate |

## Availability & resilience
| ID | NFR | Target |
|---|---|---|
| AVL-1 | **No live-path coupling** | platform **down ⇒ already-granted access still works** (Authentik holds the groups); only *new* grants/changes pause |
| AVL-2 | Grant latency | after **both** approvals, provision to Authentik in **< 10 s** |
| AVL-3 | Idempotent sync | applying a grant twice = one membership; a failed sync retries; **no lost membership** |
| AVL-4 | Reconcile drift | scheduled diff (DB ↔ Authentik) heals hand-edits; alert on drift |

## Correctness / data
| ID | NFR | Target |
|---|---|---|
| COR-1 | Source of truth | the platform DB (Applications/Roles/Assignments) is authoritative; Authentik is a projection of it |
| COR-2 | Manager resolution | manager comes from **ERPNext HR** (authoritative org hierarchy), never user-supplied |
| DR-1 | Backup | Postgres backed up (Longhorn snapshot + dump → MinIO); RPO ≤ 24h; restore tested |
| DR-2 | Rebuildable projection | Authentik groups are **re-derivable** from the DB (reconcile from scratch) |

## Observability & compliance
| ID | NFR | Target |
|---|---|---|
| OBS-1 | Metrics | requests open/approved/denied, grant latency, sync failures, drift count → Prometheus/Grafana |
| AUD-1 | Access evidence | who-has-what export + full grant/approval history (DORA / ISO-27001 access control) |
| AUD-2 | Break-glass | the `ktayl-admin` bypass is **sealed, alerted, and heavily audited** (outside the dual flow) |

## Cost
| ID | NFR | Target |
|---|---|---|
| COST-1 | Footprint | one small NestJS API + Next.js UI + a Postgres — fits the ns quota; no new cloud spend |
