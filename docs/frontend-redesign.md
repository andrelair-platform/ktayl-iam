# IAM Console — Frontend Redesign (design spec)

> **Status: DESIGN (for review) · 2026-11-19.** The specification to **follow when implementing** the IAM
> console redesign — written *before* the build so it's a clean follow-up. Authorization/personas are the
> companion [`operation-authorization-model.md`](./operation-authorization-model.md) (read it first — this
> doc renders that model as UI). Design system = **shadcn/ui + Tailwind v4** (foundation scaffolded; see
> *Phase 0*). Accessibility target = **RGAA** (axe-gated, like Retrieva).

## 1. Why — what's wrong with the current UI
The v1 console shipped to get the capability live, not as a product surface. Observed weaknesses:
1. **Four-eyes approval is a dev hack as UX** — you *type matricule numbers* into a box and click
   "Approve leg." No names, no context, error-prone.
2. **No sense of a journey.** A request has a lifecycle (requested → Security approval → owner approval →
   provisioning → active → recertify) but the page is flat lists — you can't see *where it is*.
3. **One stacked page** (file form + requests + accounts) — no detail view, no *doing* vs *browsing* split.
4. **Opaque status, no feedback** — nothing confirms an action, errors are a raw red box, matricules never
   resolve to names.
5. **Inline styles, no design system** — 5 pages × ~260 lines, each re-declaring its own `api()` helper and
   style tokens; inconsistent, a11y gaps, no components.
6. **Admin-first framing** — the employee self-service experience is an afterthought, though *every*
   employee is a user (per the authorization model).

## 2. Goals & principles
- **Persona-first IA** — the console adapts to the signed-in persona (employee vs IT/Admin); users see only
  what they can do (no "click → 403"). Driven by [`operation-authorization-model.md`](./operation-authorization-model.md).
- **Lifecycle over lists** — requests and accounts are shown as *journeys with state*, not rows.
- **People, not matricules** — resolve identities to **name · matricule** everywhere (keep both — the
  matricule is the key, the name is the human). Source: `GET /api/directory/users`.
- **Real product states** — loading (skeletons), empty (guidance), error (inline + retry), success (toast),
  and a **confirm dialog** on irreversible actions (provision/disable).
- **One design system** — shadcn/ui + Tailwind tokens; zero inline styles; shared `api` client + hooks.
- **Accessible by construction** — keyboard, labels, contrast ≥ 4.5:1, an **axe gate** in e2e (RGAA / BC02).

## 3. Design system (foundation — Phase 0, scaffolded)
- **Stack:** Tailwind v4 (`@import "tailwindcss"`, CSS-var theme) + **shadcn/ui** (new-york, Radix
  primitives, `lucide` icons), `next-themes` (dark-mode ready), `sonner` (toasts).
- **Brand tokens** (`globals.css`): `--primary` = navy `#00375A` (structure, focus, primary buttons),
  `--brand` = orange `#E8690B` (hero CTAs, active nav, accents), slate neutrals, semantic
  `--success` / `--warning` / `--destructive` for status. `--radius` ≈ 10px, Geist font.
- **Base components** (generated): button *(+`brand`/`success` variants)*, card, badge
  *(+`success`/`warning`/`brand`)*, table, input, label, select, dialog, tabs, dropdown-menu, skeleton,
  avatar, sonner, separator, tooltip.
- **Shared app code:** `lib/api.ts` (one BFF client + `ApiError`), `hooks/use-me.ts` (the session principal
  → role-aware nav), `hooks/use-directory.ts` (matricule → name map; Phase 1), `components/person-label.tsx`
  (`name · matricule` chip; Phase 1), `components/app-shell.tsx` (sidebar + topbar).

## 4. Information architecture — one app shell, role-aware nav
A persistent **app shell**: a left sidebar (filtered by persona) + a topbar (env badge, user menu, sign out).
Replaces five standalone `Shell`+logo pages.

```
┌─ ktayl IAM ───────────────────────────────────────── [dev] Sophie K · 100001 ▾ ┐
│ ┌──────────────┐  ┌───────────────────────────────────────────────────────┐ │
│ │ MY ACCESS     │  │  (page)                                                │ │
│ │ ● Dashboard   │  │                                                        │ │
│ │ ◦ Request     │  │                                                        │ │
│ │ ◦ My requests │  │                                                        │ │
│ │ ◦ My approvals│  │                                                        │ │
│ │               │  │                                                        │ │
│ │ ADMIN  (IT)   │  │                                                        │ │
│ │ ◦ Access reqs │  │                                                        │ │
│ │ ◦ Catalog     │  │                                                        │ │
│ │ ◦ Service acc │  │                                                        │ │
│ │ ◦ External    │  │                                                        │ │
│ │ ◦ Audit log   │  │                                                        │ │
│ └──────────────┘  └───────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
- **Every employee** sees the **MY ACCESS** group. The **ADMIN (IT)** group renders **only if
  `me.isAdmin`** — matching the permission matrix (no dead links, no 403s).
- Routes (App Router, route group `(app)` with the shared shell layout; the pre-auth landing stays outside):
  `/(app)/dashboard` · `/request` · `/my/requests` · `/my/approvals` · `/admin/requests` · `/admin/catalog`
  · `/admin/service-accounts` · `/admin/external-collaborators` · `/admin/audit`. (Exact paths may keep the
  current `/me`,`/admin`… during migration — the IA above is the target.)

## 5. Key screens (wireframes)
### 5.1 Service accounts — lifecycle, not lists (the hero)
```
Service accounts                                     [+ Request service account]
Tabs:  ● Pending (1)   Accounts (3)   Due for recert (0)

┌─ ktayl-qa-finance · qa · PENDING FOUR-EYES ───────────────────────────────┐
│  ●──────────●──────────○──────────○──────────○                             │
│  Filed      Security   Owner       Provision  Active                       │
│                                                                            │
│  “QA tester identity for the ktayl-core finance live-200 gate”             │
│  🛡 Security approver   Sophie K. · 100002       [ Approve ] [ Deny ]       │
│  👤 Owner              André K.  · 100006         ⏳ pending                 │
│  Groups: GROUP_Finance          Requested by André K. · 100001 · 2m ago    │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Approve/Deny are real buttons**, enabled only for the assigned approver (or admin). The dev
  "act-as-approver" (`ALLOW_APPROVER_OVERRIDE`) becomes a tucked-away **admin menu** affordance, not the
  primary flow.
- **Provision** = confirm dialog → success toast → stepper advances to **Active**, showing the Authentik
  username + Vault ref. Account rows: status badge, owner **name · matricule**, a **"due"** recert badge,
  row actions (Recertify / Provision / Disable) behind a `⋯` menu.

### 5.2 Employee self-service — "Request access"
```
Request access                                          Step 1 of 2 · pick a tool
┌───────────────────────────────────────────────────────────────────────────┐
│  Application   [ Grafana ▾ ]      Role   [ Viewer ▾ ]                       │
│  Why           [ ..................................................... ]    │
│  Approvers (four-eyes, auto-resolved):                                     │
│     Manager   André K. · 100006        Role owner   Sophie K. · 100002     │
│                                              [ Cancel ]  [ Submit request ] │
└───────────────────────────────────────────────────────────────────────────┘
```
The approvers are **shown by name** before submit (the employee sees who will decide). On submit → toast →
lands on **My requests** with the new request's lifecycle stepper.

### 5.3 External collaborators (admin — design only, not yet built)
Same lifecycle shape as service accounts, with the **governance fields** from the authorization model:
sponsor (`name · matricule`), purpose, **expiry**, scoped entitlement; recertify-before-expiry or
auto-disable. One tab list + a detail with the stepper.

### 5.4 The other surfaces (same system)
- **Dashboard** — persona-aware: an employee sees *my pending requests* + *awaiting my approval*; an admin
  additionally sees *pending four-eyes*, *accounts due recert*, *recent activity*.
- **Access requests (admin)** — the human role-request workflow, the request-card + four-eyes pattern.
- **Catalog (admin)** — applications → roles table, register/edit behind admin.
- **Audit (admin)** — searchable, exportable (CSV/JSON) activity log.

## 6. Cross-cutting UX rules (apply on every screen)
- **People:** render `<PersonLabel matricule=… />` → `name · matricule` (name from `/api/directory/users`,
  matricule always shown; falls back to matricule-only if the directory is unavailable).
- **States:** `Skeleton` while loading · an `EmptyState` (icon + one line + a primary action) when empty ·
  inline error with a **Retry** · a **Sonner** toast on every mutation · a **confirm `Dialog`** before any
  irreversible/privileged action (provision, disable, deny).
- **Auth:** a 401 from `api()` → a friendly "session expired" card with **Sign in** (not a crash).
- **Status vocabulary (one set of badge colours):** `requested`/`pending` = neutral · `active`/`approved` =
  success · `denied`/`disabled` = destructive · `due`/`expiring` = warning.
- **Forms:** inline validation (the DTO rules), disabled-until-valid submit, busy state on submit.

## 7. Phased build plan (each phase = one PR; build + a11y checked)
| Phase | Deliverable | Status |
|---|---|---|
| **0 — Foundation** | Tailwind v4 + shadcn + brand tokens + base components + shared `api`/`use-me` + app shell | **scaffolded** (this branch) |
| **1 — Service accounts** (pilot) | the lifecycle console (§5.1), `PersonLabel`, states/toasts/confirm | next |
| **2 — Employee self-service** | Dashboard + Request access (§5.2) + My requests/approvals | |
| **3 — Admin surfaces** | Access requests + Catalog + Audit on the new system | |
| **4 — External collaborators** | the new IT/Admin capability (needs the backend epic first) | |
| **5 — a11y + polish** | axe gate in e2e (RGAA/BC02), keyboard flows, contrast, dark mode | |

## 8. Out of scope / follow-ups
- The **external-collaborator backend** (entity + governed lifecycle) is a separate epic (board #17) — the UI
  (Phase 4) follows it.
- A dedicated **IT Operator** persona (split from Admin) — only if a real SoD need appears (see the authz doc).
- Delegated approval — deferred.

Related: [`operation-authorization-model.md`](./operation-authorization-model.md), [`prd.md`](./prd.md),
[`access-role-model.md`](./access-role-model.md), [`architecture/solution-architecture.md`](./architecture/solution-architecture.md).
