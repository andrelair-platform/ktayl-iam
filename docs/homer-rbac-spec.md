# Homer RBAC — role-based portal (first application of the access model)

> **Buildable spec.** Applies the [Access Role & Tier Model](./access-role-model.md) to the **Homer**
> portal so a **business user sees only business + public apps**, and the **internal engineering platform
> is visible/reachable only to engineer roles**. Homer is **static** (no native RBAC) → we split it into
> two Authentik-group-gated portals. **Status: DRAFT for review.**

## Why not "just filter links in Homer"
Homer renders a static `config.yml`; it **cannot** filter by user/role at runtime. Passing
`X-authentik-groups` to it does nothing — Homer has no logic to read it. So RBAC must be enforced
**around** Homer (Authentik group policy + separate configs), not inside it. Two clean portals is the
robust, GitOps-able pattern.

## Target design — two portals

| Portal | Host / tier | Who | Shows |
|---|---|---|---|
| **Company Portal** (business) | `homer.devandre.sbs` (Public) **and** `homer.10.0.0.200.nip.io` | **all** authenticated staff (birthright `ktayl-business`) | Business & Collaboration + Insurance domain apps + Vaultwarden + a *link out* to the eng portal (shown only to engineers) |
| **Engineering Platform Portal** | `homer-eng.10.0.0.200.nip.io` (Internal, **Tailscale only**) | **engineer groups** (`ktayl-developer/devops/data/sre/admin`) | Infrastructure · Observability · Platform & DevOps · Identity & Secrets · AI/ML ops |

Rationale: the business portal is safe to be public (business apps are already public-tier); the
engineering portal is Tailscale-only **and** Authentik-group-gated → two independent controls
(network + role), matching the model's defense-in-depth.

## Implementation (minicloud-gitops — `manifests/homer/`)

1. **Split the ConfigMap** `homer-config` → two configs:
   - `homer-config` (business): keep **Business & Collaboration** + add the insurance domain apps (Policy,
     Claims workbench, UW workbench as they ship) + Vaultwarden. Remove the engineering sections.
   - `homer-eng-config` (engineering): **Infrastructure · Observability · Platform & DevOps · Identity &
     Secrets · AI/ML ops** (the current `Tailscale`-tagged tools).
2. **Second workload** for the eng portal: `homer-eng` Deployment + Service (same image/securityContext),
   mounting `homer-eng-config`.
3. **Ingress:**
   - business `homer` Ingress: unchanged hosts (`homer.devandre.sbs` + `homer.10.0.0.200.nip.io`),
     existing domain-level Authentik forward-auth (any authenticated user).
   - new `homer-eng` Ingress: host `homer-eng.10.0.0.200.nip.io` **only** (no public host), forward-auth
     pointed at a **dedicated Authentik Application** that requires an engineer group (below). TLS via a
     new cert SAN.
4. **NetworkPolicy / Certificate:** add `homer-eng` to `manifests/homer/` (mirror existing), add the SAN.

## Authentik config (manual admin — the authorization control, not GitOps)

> Authentik application/policy/group config is **not** in GitOps (like OIDC providers, robots) → do it in
> the Authentik admin UI/API and record here.

1. **Create groups** (if absent): `ktayl-business` (birthright), `ktayl-developer`, `ktayl-devops`,
   `ktayl-data`, `ktayl-sre`, `ktayl-admin`.
2. **Assign** current users: yourself → `ktayl-admin`; real staff → `ktayl-business`; engineers → the
   relevant engineering group(s).
3. **Create an Authentik Application `homer-eng`** bound to the eng portal, with a **Group-membership
   policy**: allow only `ktayl-developer ∨ ktayl-devops ∨ ktayl-data ∨ ktayl-sre ∨ ktayl-admin`. The nginx
   outpost `/auth/nginx` then returns **403** for a business-only user → they can't load the eng portal.
4. *(Recommended, defense-in-depth)* bind the **existing** engineering apps (ArgoCD, Grafana, Vault,
   Harbor, Prometheus, Hubble, Polaris, LiteLLM-admin, Langfuse, MAAS, MinIO) to the same engineer-group
   policy — so role enforcement holds even if someone has the direct URL. This is §3 of the model applied
   app-by-app; can be staged after the Homer split.

## Acceptance criteria
- ✓ A `ktayl-business`-only user, via SSO, sees **only** business + public apps on the Company Portal and
  gets **403** on `homer-eng.10.0.0.200.nip.io`.
- ✓ An engineer (in an eng group) sees the Company Portal **and** the Engineering Platform Portal.
- ✓ The eng portal is unreachable off-Tailscale (network) **and** to non-engineer groups (role) — both
  controls independently verified.
- ✓ No secrets/links leak: the business ConfigMap contains **no** engineering URLs.

## Rollout
1. GitOps PR: split ConfigMap + `homer-eng` workload/ingress/cert/netpol (this is reversible; the business
   portal keeps working throughout).
2. Authentik: create groups + the `homer-eng` application group-policy; assign users.
3. Verify the ACs with a business-only test user and an engineer user.
4. *(Follow-up)* extend the group policy to the underlying engineering apps (defense-in-depth).

## Traceability
Implements [Access Role & Tier Model](./access-role-model.md) §2–§4 · epic **IGA-02** · board **#17**.
Underlying apps hardening = the same model, applied per app (a natural IGA-02 follow-up).
