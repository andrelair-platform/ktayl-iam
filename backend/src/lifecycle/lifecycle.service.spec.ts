import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LifecycleService, type LifecycleEvent } from './lifecycle.service.js';
import type { Identity } from './entities/identity.entity.js';

// in-memory Identity repository (matricule + email lookups)
function fakeRepo() {
  const rows: Identity[] = [];
  return {
    rows,
    create: (p: Partial<Identity>) => ({ ...p }) as Identity,
    findOne: vi.fn(async ({ where }: any) =>
      rows.find((r) => (where.matricule ? r.matricule === where.matricule : r.email === where.email)) ?? null,
    ),
    find: vi.fn(async () => [...rows]),
    save: vi.fn(async (r: Identity) => {
      const i = rows.findIndex((x) => x.matricule === r.matricule);
      if (i >= 0) rows[i] = r;
      else rows.push(r);
      return r;
    }),
  };
}

// in-memory Assignment repository
function fakeAssignments(seed: any[] = []) {
  const rows = [...seed];
  return {
    rows,
    find: vi.fn(async ({ where }: any) =>
      rows.filter((a) => a.userId === where.userId && a.status === where.status),
    ),
    save: vi.fn(async (a: any) => {
      const i = rows.findIndex((x) => x.id === a.id);
      if (i >= 0) rows[i] = a;
      else rows.push(a);
      return a;
    }),
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => ymd(new Date(Date.now() + n * 86400000));

const joiner = (matricule: string, name: string): LifecycleEvent => ({
  event: 'joiner',
  occurred_at: '2026-10-05T10:00:00+00:00',
  subject: { matricule, employee_name: name, department: 'Souscription', entity: 'Ktayl', country: 'France' },
});

function makeService(repo: ReturnType<typeof fakeRepo>, assignments = fakeAssignments()) {
  const authentik = {
    configured: true,
    ensureUser: vi.fn(async () => 42),
    addUserToGroup: vi.fn(async () => undefined),
    removeUserFromGroup: vi.fn(async () => undefined),
    getUserGroups: vi.fn(async () => ['Workplace Users']),
    disableUser: vi.fn(async () => true),
  };
  const stalwart = { configured: true, createMailbox: vi.fn(async () => true) };
  const config = { get: () => ({ workplaceGroup: 'Workplace Users', mailDomain: 'devandre.sbs' }) };
  const svc = new LifecycleService(repo as any, assignments as any, authentik as any, stalwart as any, config as any);
  return { svc, authentik, stalwart, assignments };
}

describe('LifecycleService joiner', () => {
  let repo: ReturnType<typeof fakeRepo>;
  beforeEach(() => {
    repo = fakeRepo();
  });

  it('provisions mailbox + authentik user + birthright group + identity', async () => {
    const { svc, authentik, stalwart } = makeService(repo);
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    const id = repo.rows[0];
    expect(id.matricule).toBe('100004');
    expect(id.email).toBe('sophie.bernard@devandre.sbs');
    expect(id.mailboxProvisioned).toBe(true);
    expect(id.authentikProvisioned).toBe(true);
    expect(id.status).toBe('active');
    expect(stalwart.createMailbox).toHaveBeenCalledWith('sophie.bernard', 'Sophie Bernard', expect.any(String));
    expect(authentik.ensureUser).toHaveBeenCalledWith('100004', 'Sophie Bernard', 'sophie.bernard@devandre.sbs');
    expect(authentik.addUserToGroup).toHaveBeenCalledWith('100004', 'Workplace Users');
    expect(id.initialMailboxPassword).toBeTruthy();
  });

  it('is idempotent — re-processing does not re-provision or duplicate', async () => {
    const { svc, authentik, stalwart } = makeService(repo);
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    expect(repo.rows).toHaveLength(1);
    expect(stalwart.createMailbox).toHaveBeenCalledTimes(1); // already provisioned → skipped 2nd time
    expect(authentik.ensureUser).toHaveBeenCalledTimes(1);
  });

  it('collision → second person gets a numbered address', async () => {
    const { svc } = makeService(repo);
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    await svc.handle(joiner('100099', 'Sophie Bernard')); // same name, different matricule
    expect(repo.rows.find((r) => r.matricule === '100099')!.email).toBe('sophie.bernard2@devandre.sbs');
  });

  it('S017 leaver with a FUTURE date → scheduled (status=leaving), NOT yet revoked', async () => {
    const { svc, authentik } = makeService(repo);
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    await svc.handle({ event: 'leaver', effective_date: daysFromNow(5), subject: { matricule: '100004' } });
    const id = repo.rows[0];
    expect(id.status).toBe('leaving');
    expect(id.offboardDate).toBe(daysFromNow(5));
    expect(id.deprovisionedAt).toBeFalsy();
    expect(authentik.disableUser).not.toHaveBeenCalled(); // access still intact until the day after
  });

  it('S017 leaver with a PAST date → revokes immediately (all access: groups + disable + assignments)', async () => {
    const assignments = fakeAssignments([
      { id: 'a1', userId: '100004', status: 'active', role: { authentikGroupRef: 'ktayl-claims-adjuster' } },
    ]);
    const { svc, authentik } = makeService(repo, assignments);
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    await svc.handle({ event: 'leaver', effective_date: daysFromNow(-1), subject: { matricule: '100004' } });
    const id = repo.rows[0];
    expect(id.status).toBe('left');
    expect(id.deprovisionedAt).toBeTruthy();
    expect(authentik.disableUser).toHaveBeenCalledWith('100004'); // catch-all SSO block
    expect(authentik.removeUserFromGroup).toHaveBeenCalledWith('100004', 'ktayl-claims-adjuster'); // business
    expect(authentik.removeUserFromGroup).toHaveBeenCalledWith('100004', 'Workplace Users'); // birthright
    expect(assignments.rows[0].status).toBe('revoked'); // DB source of truth
    expect(assignments.rows[0].revokedBy).toBe('system-leaver');
  });

  it('S017 revocation is idempotent (re-processing a left identity does not re-disable)', async () => {
    const { svc, authentik } = makeService(repo);
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    await svc.handle({ event: 'leaver', effective_date: daysFromNow(-1), subject: { matricule: '100004' } });
    await svc.handle({ event: 'leaver', effective_date: daysFromNow(-1), subject: { matricule: '100004' } });
    expect(authentik.disableUser).toHaveBeenCalledTimes(1);
  });

  it('S017 daily sweep revokes a due leaver (offboard date in the past)', async () => {
    const { svc, authentik } = makeService(repo);
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    // schedule for the future → not revoked on the event…
    await svc.handle({ event: 'leaver', effective_date: daysFromNow(5), subject: { matricule: '100004' } });
    expect(authentik.disableUser).not.toHaveBeenCalled();
    // …simulate the date having passed, then run the sweep
    repo.rows[0].offboardDate = daysFromNow(-1);
    await svc.processScheduledLeavers();
    expect(repo.rows[0].status).toBe('left');
    expect(authentik.disableUser).toHaveBeenCalledWith('100004');
  });

  it('a failing mailbox leg does not block identity creation (best-effort)', async () => {
    const { svc, authentik } = makeService(repo);
    (svc as any).stalwart.createMailbox = vi.fn(async () => {
      throw new Error('stalwart down');
    });
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    const id = repo.rows[0];
    expect(id.matricule).toBe('100004'); // identity still persisted
    expect(id.mailboxProvisioned).toBeFalsy(); // leg failed → flag not set (retry on redelivery)
    expect(authentik.ensureUser).toHaveBeenCalled(); // other legs still ran
  });
});
