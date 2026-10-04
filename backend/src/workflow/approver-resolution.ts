/**
 * Pure four-eyes approver resolution (S004 / ADR-007) — no I/O, fully unit-testable.
 *
 * Given the requester, the manager resolved from HR (approver #1), the role owner (approver #2)
 * and a flagged backup approver, decide the two approvers that will gate the request, enforcing:
 *   - **no self-approval** (AC-4): neither leg may be the requester;
 *   - **four-eyes** (SoD, T1): the two legs must be two *distinct* people.
 * A leg that would violate either rule is reassigned to the backup. If the backup itself still
 * clashes (tiny org / misconfig) we cannot guarantee four-eyes → it is flagged for manual review
 * rather than silently self-serving.
 */
export interface ApproverInputs {
  requesterId: string;
  /** Approver #1 as resolved from HR (the resolver already routes to the backup if it couldn't resolve a real manager or the manager is the requester). */
  managerFromHr: string;
  /** Approver #2 — the role owner. */
  roleOwner: string;
  /** The flagged backup approver (FALLBACK_APPROVER). */
  backup: string;
}

export interface ApproverResolution {
  managerApprover: string;
  ownerApprover: string;
  /** Human-readable reassignment notes for the audit trail. */
  notes: string[];
  /** True when four-eyes could NOT be guaranteed (both legs collapse to the same person). */
  needsManualReview: boolean;
}

export function resolveApprovers(input: ApproverInputs): ApproverResolution {
  const { requesterId, managerFromHr, roleOwner, backup } = input;
  const notes: string[] = [];

  let managerApprover = managerFromHr;
  let ownerApprover = roleOwner;

  // 1. no self-approval on either leg (AC-4).
  if (managerApprover === requesterId) {
    managerApprover = backup;
    notes.push('manager leg == requester → reassigned to backup (no self-approval)');
  }
  if (ownerApprover === requesterId) {
    ownerApprover = backup;
    notes.push('owner leg == requester → reassigned to backup (no self-approval)');
  }

  // 2. four-eyes: the two legs must be distinct people (T1). Reassign the owner leg to the backup.
  if (ownerApprover === managerApprover) {
    if (backup !== managerApprover && backup !== requesterId) {
      ownerApprover = backup;
      notes.push('owner leg == manager leg → owner reassigned to backup (four-eyes)');
    } else {
      notes.push(
        'WARNING: cannot guarantee four-eyes (owner, manager and backup collapse) → flagged for manual review',
      );
    }
  }

  const needsManualReview = ownerApprover === managerApprover;
  return { managerApprover, ownerApprover, notes, needsManualReview };
}
