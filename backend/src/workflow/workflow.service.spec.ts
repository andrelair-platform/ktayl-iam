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
    const afterOwner = await ctx.svc.decide({ requestId: 'req-1', approver: OWNER, decision: 'approved', comment: 'ok', actor: OWNER });
    expect(afterOwner.status).toBe('pending'); // one leg only
    expect(ctx.sync.provision).not.toHaveBeenCalled();

    const afterManager = await ctx.svc.decide({ requestId: 'req-1', approver: MANAGER, decision: 'approved', comment: 'ok', actor: MANAGER });
    expect(afterManager.status).toBe('approved');
    expect(ctx.assignmentsStore).toHaveLength(1);
    expect(ctx.assignmentsStore[0]).toMatchObject({ userId: REQUESTER, roleId: ROLE.id, status: 'active' });
    expect(ctx.sync.provision).toHaveBeenCalledTimes(1); // provisioned ONLY on both-approved
  });

  it('either denial rejects the whole request and provisions nothing (AC-2)', async () => {
    await createReq();
    await ctx.svc.decide({ requestId: 'req-1', approver: MANAGER, decision: 'approved', comment: undefined, actor: MANAGER });
    const denied = await ctx.svc.decide({ requestId: 'req-1', approver: OWNER, decision: 'denied', comment: 'no', actor: OWNER });
    expect(denied.status).toBe('denied');
    expect(ctx.assignmentsStore).toHaveLength(0);
    expect(ctx.sync.provision).not.toHaveBeenCalled();
  });

  it('rejects self-approval server-side (AC-4)', async () => {
    await createReq();
    await expect(ctx.svc.decide({ requestId: 'req-1', approver: REQUESTER, decision: 'approved', comment: undefined, actor: REQUESTER })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a decision from someone who is not an assigned approver', async () => {
    await createReq();
    await expect(ctx.svc.decide({ requestId: 'req-1', approver: '900055', decision: 'approved', comment: undefined, actor: '900055' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses to re-decide a request that is already resolved', async () => {
    await createReq();
    await ctx.svc.decide({ requestId: 'req-1', approver: MANAGER, decision: 'denied', comment: undefined, actor: MANAGER }); // → denied
    await expect(ctx.svc.decide({ requestId: 'req-1', approver: OWNER, decision: 'approved', comment: undefined, actor: OWNER })).rejects.toBeInstanceOf(
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
      await ctx.svc.decide({ requestId: 'req-1', approver: MANAGER, decision: 'denied', comment: undefined, actor: MANAGER }); // → denied
      await expect(ctx.svc.cancel('req-1', REQUESTER)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

// ── ADR-017 — batch access-requests ───────────────────────────────────────────────────────────
describe('WorkflowService — batch requests (ADR-017)', () => {
  const ROLE_A = { id: 'aaaaaaaa-1111-1111-1111-111111111111', owner: '900003', authentikGroupRef: 'g-a', application: { name: 'App A' } };
  const ROLE_B = { id: 'bbbbbbbb-2222-2222-2222-222222222222', owner: '900004', authentikGroupRef: 'g-b', application: { name: 'App B' } };

  function buildBatch() {
    const store: any[] = [];
    let seq = 0;
    const requests = {
      create: (x: any) => ({ id: `req-${++seq}`, managerDecision: null, ownerDecision: null, ...x }),
      save: vi.fn(async (x: any) => {
        const row = { id: x.id ?? `req-${++seq}`, createdAt: new Date(), ...x };
        store.push(row);
        return row;
      }),
      find: vi.fn(async ({ where }: any) => store.filter((r) => r.batchId === where.batchId)),
    };
    const roles = { findOne: vi.fn(async ({ where }: any) => (where.id === ROLE_A.id ? ROLE_A : ROLE_B)) };
    const managerResolver = { resolveManager: vi.fn(async () => ({ requester: '900009', manager: '900002', source: 'hr', fallback: false })) };
    const audit = { record: vi.fn(async () => {}) };
    const config = { get: () => ({ fallbackApprover: '900001' }) };
    const svc = new WorkflowService(requests as any, {} as any, roles as any, managerResolver as any, audit as any, {} as any, config as any);
    return { svc, store, audit };
  }

  it('creates N requests under ONE shared batchId, each with its OWN two legs', async () => {
    const { svc, store } = buildBatch();
    const out = await svc.createBatchRequest('900009', [ROLE_A.id, ROLE_B.id], '900009', 'Jane onboarding');
    expect(out.requests).toHaveLength(2);
    expect(store).toHaveLength(2);
    const batchIds = new Set(store.map((r) => r.batchId));
    expect(batchIds.size).toBe(1); // one shared instance
    expect(out.batchId).toBe([...batchIds][0]);
    expect(store.every((r) => r.batchLabel === 'Jane onboarding')).toBe(true);
    // each role keeps its own owner leg (different owners) — four-eyes per role
    expect(store.find((r) => r.roleId === ROLE_A.id).ownerApprover).toBe('900003');
    expect(store.find((r) => r.roleId === ROLE_B.id).ownerApprover).toBe('900004');
  });

  it('dedupes repeated roleIds and rejects an empty batch', async () => {
    const { svc, store } = buildBatch();
    await svc.createBatchRequest('900009', [ROLE_A.id, ROLE_A.id], '900009');
    expect(store).toHaveLength(1); // deduped
    await expect(svc.createBatchRequest('900009', [], '900009')).rejects.toThrow(/at least one role/);
  });

  it('getBatch returns the roles + a derived summary (which are granted vs pending)', async () => {
    const { svc } = buildBatch();
    const { batchId } = await svc.createBatchRequest('900009', [ROLE_A.id, ROLE_B.id], '900009');
    const view = await svc.getBatch(batchId);
    expect(view.batchId).toBe(batchId);
    expect(view.requester).toBe('900009');
    expect(view.requests).toHaveLength(2);
    expect(view.summary).toEqual({ total: 2, granted: 0, pending: 2, denied: 0, cancelled: 0 });
  });

  it('getBatch 404s an unknown batch', async () => {
    const { svc } = buildBatch();
    await expect(svc.getBatch('00000000-0000-0000-0000-000000000000')).rejects.toThrow(/not found/);
  });
});
