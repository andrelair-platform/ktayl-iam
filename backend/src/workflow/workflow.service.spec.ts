import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { WorkflowService } from './workflow.service.js';

// Synthetic 9xxxxx matricules only.
const REQUESTER = '900009';
const MANAGER = '900002';
const OWNER = '900003';
const BACKUP = '900001';
const ROLE = {
  id: '11111111-1111-1111-1111-111111111111',
  owner: OWNER,
  authentikGroupRef: 'engineering-portal',
  application: { name: 'Homer (engineering portal)' },
};

/** Build the service with in-memory fakes; returns the service + the sync spy + the live request store. */
function build() {
  let request: any = null;
  const assignmentsStore: any[] = [];

  const requests = {
    create: (x: any) => ({ id: 'req-1', managerDecision: null, ownerDecision: null, ...x }),
    save: vi.fn(async (x: any) => {
      request = { ...request, ...x };
      return request;
    }),
    findOne: vi.fn(async () => request),
    find: vi.fn(async () => (request ? [request] : [])),
  };
  const assignments = {
    create: (x: any) => ({ id: 'asg-1', ...x }),
    save: vi.fn(async (x: any) => {
      const row = { id: x.id ?? 'asg-1', ...x };
      assignmentsStore.push(row);
      return row;
    }),
    findOne: vi.fn(async () => null),
  };
  const roles = { findOne: vi.fn(async () => ROLE) };
  const managerResolver = {
    resolveManager: vi.fn(async () => ({ requester: REQUESTER, manager: MANAGER, source: 'hr', fallback: false })),
  };
  const audit = { record: vi.fn(async () => {}) };
  const sync = { provision: vi.fn(async () => {}), revoke: vi.fn(async () => {}) };
  const config = { get: () => ({ fallbackApprover: BACKUP }) };

  const svc = new WorkflowService(
    requests as any,
    assignments as any,
    roles as any,
    managerResolver as any,
    audit as any,
    sync as any,
    config as any,
  );
  return { svc, sync, audit, assignmentsStore, getRequest: () => request };
}

describe('WorkflowService — dual approval (S004, ADR-007)', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  async function createReq() {
    return ctx.svc.createRequest(REQUESTER, ROLE.id, REQUESTER);
  }

  it('creates a pending request with the two resolved approvers frozen (AC-1)', async () => {
    const req = await createReq();
    expect(req.status).toBe('pending');
    expect(req.managerApprover).toBe(MANAGER);
    expect(req.ownerApprover).toBe(OWNER);
    expect(ctx.sync.provision).not.toHaveBeenCalled(); // AC-5: nothing provisioned yet
  });

  it('grants only after BOTH approve, order-independent → active assignment + provision (AC-1/AC-5)', async () => {
    await createReq();
    const afterOwner = await ctx.svc.decide('req-1', OWNER, 'approved', 'ok', OWNER);
    expect(afterOwner.status).toBe('pending'); // one leg only
    expect(ctx.sync.provision).not.toHaveBeenCalled();

    const afterManager = await ctx.svc.decide('req-1', MANAGER, 'approved', 'ok', MANAGER);
    expect(afterManager.status).toBe('approved');
    expect(ctx.assignmentsStore).toHaveLength(1);
    expect(ctx.assignmentsStore[0]).toMatchObject({ userId: REQUESTER, roleId: ROLE.id, status: 'active' });
    expect(ctx.sync.provision).toHaveBeenCalledTimes(1); // provisioned ONLY on both-approved
  });

  it('either denial rejects the whole request and provisions nothing (AC-2)', async () => {
    await createReq();
    await ctx.svc.decide('req-1', MANAGER, 'approved', undefined, MANAGER);
    const denied = await ctx.svc.decide('req-1', OWNER, 'denied', 'no', OWNER);
    expect(denied.status).toBe('denied');
    expect(ctx.assignmentsStore).toHaveLength(0);
    expect(ctx.sync.provision).not.toHaveBeenCalled();
  });

  it('rejects self-approval server-side (AC-4)', async () => {
    await createReq();
    await expect(ctx.svc.decide('req-1', REQUESTER, 'approved', undefined, REQUESTER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a decision from someone who is not an assigned approver', async () => {
    await createReq();
    await expect(ctx.svc.decide('req-1', '900055', 'approved', undefined, '900055')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses to re-decide a request that is already resolved', async () => {
    await createReq();
    await ctx.svc.decide('req-1', MANAGER, 'denied', undefined, MANAGER); // → denied
    await expect(ctx.svc.decide('req-1', OWNER, 'approved', undefined, OWNER)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  describe('cancel (S010 — requester cancels own pending)', () => {
    it('cancels a pending request raised by the actor', async () => {
      await createReq();
      const r = await ctx.svc.cancel('req-1', REQUESTER);
      expect(r.status).toBe('cancelled');
    });

    it('rejects cancel by someone other than the requester', async () => {
      await createReq();
      await expect(ctx.svc.cancel('req-1', OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to cancel a request that is no longer pending', async () => {
      await createReq();
      await ctx.svc.decide('req-1', MANAGER, 'denied', undefined, MANAGER); // → denied
      await expect(ctx.svc.cancel('req-1', REQUESTER)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
