import type { Me } from "@/hooks/use-me";

/**
 * Console capability flags — the permission strings the UI gates on (see
 * docs/operation-authorization-model.md). The UI checks a CAPABILITY, never a raw `isAdmin`, so a future
 * `IT Operator` split is a config change here, not a refactor across components.
 */
export type Capability =
  | "requests:create"
  | "requests:decide"
  | "requests:reassign"
  | "recert:own"
  | "catalog:read"
  | "catalog:manage"
  | "service_accounts:manage"
  | "collaborators:manage"
  | "provisioning:manage"
  | "reconcile:run"
  | "audit:read:self"
  | "audit:read:all"
  | "governance:edit";

const EMPLOYEE: Capability[] = [
  "requests:create",
  "requests:decide",
  "recert:own",
  "catalog:read",
  "audit:read:self",
];

/** Admin = every capability. (An `IT Operator` role would be ALL minus `governance:edit` — reserved, not active.) */
const ADMIN: Capability[] = [
  ...EMPLOYEE,
  "requests:reassign",
  "catalog:manage",
  "service_accounts:manage",
  "collaborators:manage",
  "provisioning:manage",
  "reconcile:run",
  "audit:read:all",
  "governance:edit",
];

export function capabilitiesFor(me: Me | null): Set<Capability> {
  if (!me) return new Set();
  return new Set(me.isAdmin ? ADMIN : EMPLOYEE);
}

/** True if the signed-in principal holds `cap`. Drives role-aware nav + action visibility. */
export function can(me: Me | null, cap: Capability): boolean {
  return capabilitiesFor(me).has(cap);
}
