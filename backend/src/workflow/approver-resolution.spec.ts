import { describe, it, expect } from 'vitest';
import { resolveApprovers } from './approver-resolution.js';

// Synthetic 9xxxxx matricules only (never real people).
const REQUESTER = '900009';
const MANAGER = '900002';
const OWNER = '900003';
const BACKUP = '900001';

describe('resolveApprovers (four-eyes, AC-4)', () => {
  it('keeps two distinct approvers when manager, owner and requester all differ', () => {
    const r = resolveApprovers({ requesterId: REQUESTER, managerFromHr: MANAGER, roleOwner: OWNER, backup: BACKUP });
    expect(r.managerApprover).toBe(MANAGER);
    expect(r.ownerApprover).toBe(OWNER);
    expect(r.needsManualReview).toBe(false);
    expect(r.notes).toHaveLength(0);
  });

  it('reassigns the OWNER leg to the backup when the role owner IS the requester (no self-approval)', () => {
    const r = resolveApprovers({ requesterId: REQUESTER, managerFromHr: MANAGER, roleOwner: REQUESTER, backup: BACKUP });
    expect(r.ownerApprover).toBe(BACKUP);
    expect(r.managerApprover).toBe(MANAGER);
    expect(r.notes.join(' ')).toMatch(/owner leg == requester/);
    expect(r.needsManualReview).toBe(false);
  });

  it('reassigns the MANAGER leg to the backup when the resolved manager IS the requester', () => {
    const r = resolveApprovers({ requesterId: REQUESTER, managerFromHr: REQUESTER, roleOwner: OWNER, backup: BACKUP });
    expect(r.managerApprover).toBe(BACKUP);
    expect(r.ownerApprover).toBe(OWNER);
    expect(r.notes.join(' ')).toMatch(/manager leg == requester/);
  });

  it('reassigns the OWNER leg when owner == manager (keeps four-eyes with two distinct people)', () => {
    const r = resolveApprovers({ requesterId: REQUESTER, managerFromHr: OWNER, roleOwner: OWNER, backup: BACKUP });
    expect(r.managerApprover).toBe(OWNER);
    expect(r.ownerApprover).toBe(BACKUP);
    expect(r.managerApprover).not.toBe(r.ownerApprover);
    expect(r.needsManualReview).toBe(false);
  });

  it('flags manual review when owner, manager and backup all collapse to one person (cannot guarantee four-eyes)', () => {
    const r = resolveApprovers({ requesterId: REQUESTER, managerFromHr: OWNER, roleOwner: OWNER, backup: OWNER });
    expect(r.needsManualReview).toBe(true);
    expect(r.notes.join(' ')).toMatch(/cannot guarantee four-eyes/);
  });
});
