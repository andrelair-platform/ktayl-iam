import { describe, it, expect, vi } from 'vitest';
import { ManagerResolverService } from './manager-resolver.service.js';

const FALLBACK = '900001';

function makeResolver(hr: { getManagerMatricule: any; configured: boolean }) {
  const config = { get: () => ({ fallbackApprover: FALLBACK }) };
  return new ManagerResolverService(hr as any, config as any);
}

describe('ManagerResolverService (AC-3 / AC-4)', () => {
  it('AC-2/3: resolves the manager from HR keyed on the matricule (never from input)', async () => {
    const hr = { configured: true, getManagerMatricule: vi.fn().mockResolvedValue('900010') };
    const res = await makeResolver(hr).resolveManager('900011');
    expect(res).toEqual({ requester: '900011', manager: '900010', source: 'hr', fallback: false });
    // AC-3 evidence: HR was asked for exactly the requester's matricule; nothing else is trusted.
    expect(hr.getManagerMatricule).toHaveBeenCalledWith('900011');
  });

  it('AC-4: no manager in HR → flagged fallback approver', async () => {
    const hr = { configured: true, getManagerMatricule: vi.fn().mockResolvedValue(null) };
    const res = await makeResolver(hr).resolveManager('900011');
    expect(res).toMatchObject({ manager: FALLBACK, source: 'fallback', fallback: true });
    expect(res.reason).toMatch(/no manager found/i);
  });

  it('AC-4: HR not configured → flagged fallback with an explanatory reason', async () => {
    const hr = { configured: false, getManagerMatricule: vi.fn().mockResolvedValue(null) };
    const res = await makeResolver(hr).resolveManager('900011');
    expect(res).toMatchObject({ manager: FALLBACK, source: 'fallback', fallback: true });
    expect(res.reason).toMatch(/not configured/i);
  });

  it('AC-4: HR manager equals the requester → fallback (no silent self-approval seed)', async () => {
    const hr = { configured: true, getManagerMatricule: vi.fn().mockResolvedValue('900011') };
    const res = await makeResolver(hr).resolveManager('900011');
    expect(res).toMatchObject({ manager: FALLBACK, source: 'fallback', fallback: true });
    expect(res.reason).toMatch(/requester/i);
  });
});
