# App Authorization Bindings — engineer-role gating per app (IGA-02 follow-up)

> **Runbook + matrix.** Applies the [Access Role & Tier Model](./access-role-model.md) **ADR-003**
> (*authorize at the Authentik Application↔group binding*) to the **underlying apps**, so a role gate
> holds **even with a direct URL** — defense-in-depth beyond the Homer portal split + Tailscale. This is
> **Authentik admin config, not GitOps** (same class as OIDC providers). **Status: DRAFT for review.**

## Why this exists

The [Homer RBAC split](./homer-rbac-spec.md) hides engineering tools from business users, and Tailscale
keeps the internal tier off the public internet. But neither *authorizes*: a business user who is on
Tailscale and **types `https://grafana.10.0.0.200.nip.io`** would still get in (SSO authenticates them;
nothing checks their role). Binding each app's **Authentik Application** to an engineer-group policy
closes that — Authentik denies the request (403 at the proxy for forward-auth apps; refused authorization
for native-OIDC apps) for anyone outside the allowed groups.

## How the binding works (two integration styles, same control)

- **Forward-auth apps** (nginx `auth_request` → Authentik embedded outpost): the outpost evaluates the
  Application's **policy bindings** on every request → **403** if the user isn't in an allowed group.
- **Native-OIDC apps** (the app logs the user in via Authentik OIDC — Grafana, ArgoCD, Harbor, Vault,
  Langfuse…): the same **policy bindings** gate the **authorization request** → Authentik refuses to issue
  a token → the user can't complete login. In-app RBAC (Grafana Admin/Viewer, ArgoCD RBAC) layers under it.

Either way the control is **one Group-membership policy bound to the Application** — uniform (ADR-003).

## Binding matrix (allowed groups per app)

Groups: `business` (birthright, all staff) · `developer` · `devops` · `data` · `sre` · `admin`. "Engineers"
= any of developer/devops/data/sre/admin. Everything below is **internal/restricted tier** (Tailscale).

| App | Authentik Application (host) | Allowed groups | Tier |
|---|---|---|---|
| **Homer — Engineering Portal** | `homer-eng.10.0.0.200.nip.io` | all engineers | Internal |
| ArgoCD | `argocd.10.0.0.200.nip.io` | developer · devops · sre · admin | Internal |
| Grafana | `grafana.10.0.0.200.nip.io` | developer · devops · data · sre · admin | Internal |
| Prometheus | `prometheus.10.0.0.200.nip.io` | developer · devops · sre · admin | Internal |
| Alertmanager | `alertmanager.10.0.0.200.nip.io` | devops · sre · admin | Internal |
| Hubble | `hubble.10.0.0.200.nip.io` | devops · sre · admin | Internal |
| Polaris | `polaris.10.0.0.200.nip.io` | developer · devops · sre · admin | Internal |
| Harbor | `harbor.10.0.0.200.nip.io` | developer · devops · admin | Internal |
| Backstage | `backstage.10.0.0.200.nip.io` | all engineers | Internal |
| NATS monitor | `nats.10.0.0.200.nip.io` | developer · devops · sre · admin | Internal |
| LiteLLM admin | `litellm.10.0.0.200.nip.io` | developer · devops · data · admin | Internal |
| Langfuse | `langfuse.10.0.0.200.nip.io` | developer · devops · data · admin | Internal |
| MLflow | `mlflow.10.0.0.200.nip.io` | developer · devops · data · admin | Internal |
| **Vault** | `vault.10.0.0.200.nip.io` | **devops · admin** | **Restricted** |

> **Business apps stay open to `business`** (all staff) — Mail, Chat, Nextcloud, Element, Jitsi, Sign,
> Vaultwarden, ERPNext, ktayl-solution: SSO only, **no** engineer-group restriction. Don't bind these.

### Not behind Authentik → rely on Tailscale + native login (documented exception)
- **MAAS** (`100.88.123.8:5240`) and **MinIO console** (`100.88.123.8:9001`) are reached by controller
  **IP:port, not via the k8s ingress / Authentik outpost** → no Authentik Application to bind. Their access
  control is **Tailscale (network) + their own admin login**. Treat as **devops/admin-only** by convention;
  a future improvement is to front them with an Authentik proxy provider. Recorded, not a silent gap.

## Rollout — staged, most-sensitive first

Apply in waves; verify each before the next (a mis-scoped policy locks *you* out — keep `admin` in every set):
1. **Restricted first:** Vault. (Highest blast radius — do it carefully, confirm `admin` access first.)
2. **Delivery/registry:** ArgoCD, Harbor, NATS.
3. **Observability:** Grafana, Prometheus, Alertmanager, Hubble, Polaris.
4. **AI-ops:** LiteLLM admin, Langfuse, MLflow.
5. **Dev portal:** Backstage.

(`homer-eng` is already the pilot from the Homer PR.)

## Runbook (Authentik admin — per app)

1. Ensure the groups exist (from [homer-rbac-spec](./homer-rbac-spec.md) step 1).
2. **Create one reusable Group-membership policy per allowed-set** (e.g. `require-engineer`,
   `require-devops-admin`, `require-data-eng`) — *Customisation → Policies → Group Membership* (or an
   Expression policy `return ak_is_group_member(request.user, name="ktayl-devops") or …`).
3. **Bind** the policy to each app's **Application** (*Applications → <app> → Policy/Group/User Bindings →
   Bind existing policy*). For native-OIDC apps this gates the authorize step; for forward-auth apps the
   outpost enforces it.
4. Leave `ktayl-admin` in **every** allowed set (break-glass).

## Verify (per app)
- ✓ A `ktayl-business`-only test user → **403 / access-denied** on the app (even on Tailscale, direct URL).
- ✓ A user in an allowed group → normal access.
- ✓ You (`ktayl-admin`) retain access to **all** apps (no self-lockout).

## Rollback
Unbind the policy from the Application (*Application → Bindings → delete*) → back to SSO-only. Instant,
no redeploy. Because this is Authentik-side, nothing in GitOps changes.

## Traceability
Implements [Access Role & Tier Model](./access-role-model.md) §3–§4 + **ADR-003** · epic **IGA-02** ·
board **#17**. Consumes the same groups as the [Homer RBAC](./homer-rbac-spec.md).
