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
    save: vi.fn(async (r: Identity) => {
      const i = rows.findIndex((x) => x.matricule === r.matricule);
      if (i >= 0) rows[i] = r;
      else rows.push(r);
      return r;
    }),
  };
}

const joiner = (matricule: string, name: string): LifecycleEvent => ({
  event: 'joiner',
  occurred_at: '2026-10-05T10:00:00+00:00',
  subject: { matricule, employee_name: name, department: 'Souscription', entity: 'Ktayl', country: 'France' },
});

function makeService(repo: ReturnType<typeof fakeRepo>) {
  const authentik = { configured: true, ensureUser: vi.fn(async () => 42), addUserToGroup: vi.fn(async () => undefined) };
  const stalwart = { configured: true, createMailbox: vi.fn(async () => true) };
  const config = { get: () => ({ workplaceGroup: 'Workplace Users', mailDomain: 'devandre.sbs' }) };
  const svc = new LifecycleService(repo as any, authentik as any, stalwart as any, config as any);
  return { svc, authentik, stalwart };
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

  it('leaver marks the identity left (does not deprovision — that is S017)', async () => {
    const { svc, authentik } = makeService(repo);
    await svc.handle(joiner('100004', 'Sophie Bernard'));
    await svc.handle({ event: 'leaver', subject: { matricule: '100004' } });
    expect(repo.rows[0].status).toBe('left');
    expect(authentik.addUserToGroup).toHaveBeenCalledTimes(1); // joiner only; no revoke here
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
