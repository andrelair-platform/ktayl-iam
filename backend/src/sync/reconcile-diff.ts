/**
 * Pure DB↔Authentik reconcile diff (S005, AC-4) — no I/O, fully unit-testable.
 *
 * The DB (active assignments) is the source of truth. For each governed Authentik group we compare
 * the *desired* members (users with an active assignment for a role that maps to the group) against
 * the *actual* members Authentik reports, and emit the membership changes that heal the drift:
 *   - a desired member missing in Authentik → **add** (someone hand-removed it, or a failed sync — T5/AVL-3);
 *   - an actual member with no active assignment → **remove** (a hand-added membership — T5).
 */
export interface GroupMembers {
  group: string;
  users: Set<string>;
}
export interface DriftChange {
  group: string;
  user: string;
  op: 'add' | 'remove';
  reason: string;
}

export function computeDrift(
  desired: Map<string, Set<string>>,
  actual: Map<string, Set<string>>,
): DriftChange[] {
  const changes: DriftChange[] = [];
  const groups = new Set<string>([...desired.keys(), ...actual.keys()]);
  for (const group of groups) {
    const want = desired.get(group) ?? new Set<string>();
    const have = actual.get(group) ?? new Set<string>();
    for (const user of want) {
      if (!have.has(user)) {
        changes.push({ group, user, op: 'add', reason: 'active assignment not enforced in Authentik' });
      }
    }
    for (const user of have) {
      if (!want.has(user)) {
        changes.push({ group, user, op: 'remove', reason: 'Authentik membership has no active assignment' });
      }
    }
  }
  return changes;
}
