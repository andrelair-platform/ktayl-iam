# AGENTS.md — ktayl-iam

Tiny repo-specific context. Org rules (`minicloud-gitops/.claude/rules/*`) still apply.

## Policy
- This is a **custom-built Access Governance Platform** (NestJS API + Next.js UI + Postgres) on top of
  **Authentik** (the IdP/directory — the "Entra"). Authentik does auth + enforcement; **never re-implement
  authentication here.** The platform is the source of truth for App→Role→Assignment and **provisions**
  Authentik groups/memberships via the Authentik API. Design: `docs/` (brief · prd · architecture · ADRs).
- **NOT MidPoint** — off-the-shelf IGA was considered and rejected (ADR-006). Don't reintroduce it.
- **Dual approval is a hard requirement (ADR-007):** a role request provisions **only** after BOTH the
  user's manager (from ERPNext HR) AND the role owner approve. No self-approval (requester ≠ approver).
  Never weaken this to a single approval.

## Non-default conventions
- Secrets (DB creds + the **least-privilege** Authentik API token) come from **ESO→Vault** — never in Git.
- Deploys via the **GAP wrapper chart** (`services/ktayl-iam/helm/` in `minicloud-gitops`) — not raw manifests.
- Manager relationship is read from **ERPNext HR**, never from a request payload (threat T3).

## Pitfalls
- Authentik **groups + Application policy bindings are manual admin** (not GitOps) until this platform
  automates them — see `docs/homer-rbac-spec.md` + `docs/app-authz-bindings.md`.
- **NEVER involve Retrieva** — this is the ktayl IS layer.
