import { describe, it, expect, vi } from 'vitest';
import { AccessService } from './access.service.js';

/**
 * ADR-017 — the self-service "My Access" complete picture: governed grants (assignments) merged with the
 * user's live Authentik groups, each row tagged by source, no duplicates.
 */
function make(opts: { assignments?: any[]; liveGroups?: string[]; authentikConfigured?: boolean } = {}) {
  const assignments = {
    find: vi.fn(async () => opts.assignments ?? []),
  };
  const apps = {};
  const audit = {};
  const authentik = {
    configured: opts.authentikConfigured ?? true,
    getUserGroups: vi.fn(async () => opts.liveGroups ?? []),
  };
  const config = { get: () => ({ workplaceGroup: 'Workplace Users' }) };
  const svc = new AccessService(assignments as any, apps as any, audit as any, authentik as any, config as any);
  return { svc, authentik };
}

const governedAssignment = (group: string, role: string, app: string) => ({
  status: 'active',
  syncedAt: new Date(),
  grantedAt: new Date('2026-01-01T00:00:00Z'),
  role: { name: role, authentikGroupRef: group, application: { name: app } },
});

describe('AccessService.forUserComplete (ADR-017 My Access)', () => {
  it('tags governed grants as Governed', async () => {
    const { svc } = make({ assignments: [governedAssignment('g-claims', 'Claims RW', 'Claims')], liveGroups: [] });
    const out = await svc.forUserComplete('900009');
    expect(out.user).toBe('900009');
    expect(out.access).toHaveLength(1);
    expect(out.access[0]).toMatchObject({ source: 'Governed', role: 'Claims RW', application: 'Claims' });
  });

  it('tags the Workplace Users group as Birthright and other live groups as Direct', async () => {
    const { svc } = make({ assignments: [], liveGroups: ['Workplace Users', 'some-adhoc-group'] });
    const out = await svc.forUserComplete('900009');
    const bySource = Object.fromEntries(out.access.map((r) => [r.authentikGroup, r.source]));
    expect(bySource['Workplace Users']).toBe('Birthright');
    expect(bySource['some-adhoc-group']).toBe('Direct');
  });

  it('does NOT duplicate a live group that is already a governed grant', async () => {
    const { svc } = make({
      assignments: [governedAssignment('g-claims', 'Claims RW', 'Claims')],
      liveGroups: ['g-claims', 'Workplace Users'], // g-claims is already governed
    });
    const out = await svc.forUserComplete('900009');
    const claims = out.access.filter((r) => r.authentikGroup === 'g-claims');
    expect(claims).toHaveLength(1); // not duplicated
    expect(claims[0].source).toBe('Governed');
    expect(out.access.find((r) => r.authentikGroup === 'Workplace Users')?.source).toBe('Birthright');
  });

  it('is best-effort: if Authentik is unreachable, still returns the governed grants', async () => {
    const { svc, authentik } = make({ assignments: [governedAssignment('g-claims', 'Claims RW', 'Claims')] });
    authentik.getUserGroups.mockRejectedValueOnce(new Error('authentik down'));
    const out = await svc.forUserComplete('900009');
    expect(out.access).toHaveLength(1);
    expect(out.access[0].source).toBe('Governed');
  });
});
