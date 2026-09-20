# Access Role & Tier Model (IGA-02)

> **The governing artefact for who-can-access-what on the ktayl IS.** Personas → access tiers →
> entitlements → **Authentik groups** (runtime enforcement) → managed by the **custom Access Governance
> Platform** (the system of record we build — [PRD](./prd.md) / [architecture](./architecture/solution-architecture.md)).
> Every app's authorization — starting with the Homer portal — is an *application* of this model, never a
> per-app invention. **Status: DRAFT for review.**

## 1. Access tiers (network + sensitivity)

| Tier | Reachable via | SSO | Extra gate | Examples |
|---|---|---|---|---|
| **Public** | Internet (Cloudflare, `*.devandre.sbs`) | ✅ Authentik | — | Chat, Mail, ERPNext, Nextcloud, Element, Jitsi, Sign, ktayl-solution, Homer *business* portal |
| **Internal** | **Tailscale only** (`*.10.0.0.200.nip.io` + minicloud CA) | ✅ Authentik | **role group** | ArgoCD, Grafana, Prometheus, Harbor, Backstage, Hubble, Polaris, LiteLLM admin, Langfuse, Homer *engineering* portal |
| **Restricted** | Tailscale only | ✅ Authentik | **role group + break-glass** | Vault, MAAS, MinIO console |

Network (Tailscale) is a *coarse* control; **the role group is the authorization control** this model adds.

## 2. Personas → Authentik groups

Each user is provisioned into **one base group + optional add-ons**. Group = the runtime policy object
Authentik forward-auth and Homer read.

| Persona | Authentik group | Base tier reach |
|---|---|---|
| **Business user** (underwriting, claims, finance, compliance ops, servicing) | `ktayl-business` | Public + the business apps (some internal) |
| **Developer** | `ktayl-developer` | + engineering **build/deliver** tools |
| **DevOps / Platform engineer** | `ktayl-devops` | + engineering **operate/secure** tools (incl. Restricted) |
| **Data engineer / analyst** | `ktayl-data` | + data/AI-ops tools |
| **SRE** | `ktayl-sre` | + observability/incident/delivery |
| **Admin / break-glass** | `ktayl-admin` | everything incl. Restricted |

`ktayl-business` is the **birthright** group (every staff member). Engineering groups are **additive** and
**requestable** (→ approval in the custom platform, §5). "Engineer" in the Homer split = any of
`ktayl-developer | ktayl-devops | ktayl-data | ktayl-sre | ktayl-admin`.

## 3. Entitlement matrix (role → app group)

✅ = entitled · — = not entitled. App groups mirror the Homer sections.

| App group (examples) | business | developer | devops | data | sre | admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Business & Collaboration** (Mail, Chat, Element, Jitsi, Nextcloud, Sign, ERPNext, ktayl-solution) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Insurance domain apps** (Policy, Claims workbench, UW workbench, portals) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Project/DevPortal** (Plane, Backstage, GitHub) | read | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Platform & DevOps** (ArgoCD, NATS, Harbor) | — | ✅ | ✅ | — | ✅ | ✅ |
| **Observability** (Grafana, Prometheus, Alertmanager, Hubble, Polaris) | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| **AI / ML ops** (LiteLLM admin, Langfuse, MLflow) | — | ✅ | ✅ | ✅ | — | ✅ |
| **Infrastructure** (MAAS, MinIO) | — | — | ✅ | — | — | ✅ |
| **Identity & Secrets** (Vault, Authentik admin) — **Restricted** | — | — | ✅ | — | — | ✅ |
| **Homer — business portal** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Homer — engineering portal** | — | ✅ | ✅ | ✅ | ✅ | ✅ |

> Vaultwarden (personal password manager) is birthright (all staff). Business users retain access to the
> *business* apps even when those sit on the internal tier (they get Tailscale for those) — the role, not
> the network, is what grants them; the engineering platform is what business users are excluded from.

## 4. Enforcement points (defense-in-depth)

```
1. NETWORK    Tailscale + minicloud CA  → internal/restricted tiers unreachable off-VPN (coarse)
2. AUTHN      Authentik OIDC + MFA (forward-auth, domain-level)            → who you are
3. AUTHZ  ★   Authentik application ↔ group policy binding                  → what you may reach  (THE new control)
              (each app's Authentik Application requires its entitled group; the nginx outpost
               /auth/nginx returns 403 for a user lacking the group)
4. APP RBAC   in-app roles where the app has them (Grafana Admin/Viewer, ArgoCD RBAC, ERPNext roles)
```

Layer 3 is what IGA-02 adds: today apps are only authenticated, not authorized by role. Binding each
Authentik **Application** to its entitled group (§3) turns SSO into RBAC — and Homer's two portals become
a truthful reflection of it (you only see what you can actually reach).

## 5. Governance lifecycle (Authentik enforces · the custom platform governs)

- **Enforcement (always):** **Authentik groups** are the runtime enforcement point (forward-auth / OIDC per app).
- **Governance (what we build):** the **custom Access Governance Platform** ([PRD](./prd.md)) is the
  **system of record** for Applications→Roles→assignments. It runs **request → approval → provision**
  (IGA-01) and **writes the Authentik groups + memberships** (birthright `ktayl-business`; requestable
  engineering roles), later adding **recertification** (IGA-03), **SCIM to business apps** (IGA-04), and
  **SoD** (IGA-05). Authentik = IdP + PEP; the platform = PAP/source-of-truth. *(No MidPoint — we build our
  own; see [ADR-006](./architecture/adr/000-index.md#adr-006).)*
- **Interim (until the platform ships):** Authentik group membership is set **by hand** (the manual steps in
  [homer-rbac-spec](./homer-rbac-spec.md) + [app-authz-bindings](./app-authz-bindings.md)); the platform
  then automates exactly those grants.
- **Least privilege + SoD:** engineering roles are additive & requestable, not default; `ktayl-admin` is
  break-glass (sealed, audited). SoD rules (requester ≠ approver) land with IGA-03/05.

## 6. Applications of this model
- **[Homer RBAC spec](./homer-rbac-spec.md)** — the business/engineering portal split (birthright business
  view for all; engineering portal gated to the engineer groups above). *Implemented (minicloud-gitops#1221).*
- **[App authorization bindings](./app-authz-bindings.md)** — the **defense-in-depth** follow-up: bind each
  underlying app's Authentik Application to its allowed engineer group(s) so the role gate holds **even with
  a direct URL** (ADR-003), with a per-app matrix + staged runbook.

## 7. Cross-references
[Brief](./brief.md) · [ADRs](./architecture/adr/000-index.md) · [Homer RBAC spec](./homer-rbac-spec.md) ·
EA Blueprint *Enterprise IT / BYOD boundary* · `project-governance.md` *IS scope boundaries*.
