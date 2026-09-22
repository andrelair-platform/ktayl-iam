import { describe, it, expect, vi, afterEach } from 'vitest';
import { HrClient } from './hr.client.js';

function client(creds: boolean) {
  const config = {
    get: () => ({
      erpnextUrl: 'https://erp.example',
      erpnextApiKey: creds ? 'key' : '',
      erpnextApiSecret: creds ? 'secret' : '',
    }),
  };
  return new HrClient(config as any);
}
const ok = (body: unknown) => ({ ok: true, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('HrClient', () => {
  it('is not configured without API creds → returns null and makes no call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = client(false);
    expect(c.configured).toBe(false);
    expect(await c.getManagerMatricule('900011')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves the manager matricule via the reports_to chain', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ data: [{ name: 'HR-EMP-011', reports_to: 'HR-EMP-010' }] }))
      .mockResolvedValueOnce(ok({ data: { employee_number: '900010' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await client(true).getManagerMatricule('900011')).toBe('900010');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when the employee has no reports_to', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ data: [{ name: 'HR-EMP-011', reports_to: null }] })));
    expect(await client(true).getManagerMatricule('900011')).toBeNull();
  });

  it('returns null (graceful) when ERPNext errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    expect(await client(true).getManagerMatricule('900011')).toBeNull();
  });
});
