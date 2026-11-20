import { describe, it, expect, vi } from 'vitest';
import { ExternalCollaboratorSentinelService } from './external-collaborator-sentinel.service.js';

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

function makeService(active: any[]) {
  const collaborators = {
    listActive: vi.fn(async () => active),
    updateStatus: vi.fn(async () => undefined),
  };
  const authentik = {
    configured: true,
    isActiveUser: vi.fn(async (m: string) => m !== '900099'), // 900099 = a departed sponsor
    disableUser: vi.fn(async () => true),
  };
  const workplace = { disableMailbox: vi.fn(async () => undefined) };
  const svc = new ExternalCollaboratorSentinelService(collaborators as any, authentik as any, workplace as any);
  return { svc, collaborators, authentik, workplace };
}

const EXPIRED = { id: 'a', name: 'ext-a', authentikUsername: 'ext-a', sponsorMatricule: '100006', expiresAt: past, workplaceEmail: 'ex.a@devandre.sbs' };
const SPONSOR_LEFT = { id: 'b', name: 'ext-b', authentikUsername: 'ext-b', sponsorMatricule: '900099', expiresAt: future, workplaceEmail: 'ex.b@devandre.sbs' };
const HEALTHY = { id: 'c', name: 'ext-c', authentikUsername: 'ext-c', sponsorMatricule: '100006', expiresAt: future, workplaceEmail: 'ex.c@devandre.sbs' };

describe('ExternalCollaboratorSentinelService.sweep', () => {
  it('suspends an EXPIRED collaborator (status=expired + Authentik disabled)', async () => {
    const { svc, collaborators, authentik } = makeService([EXPIRED]);
    const r = await svc.sweep();
    expect(r).toEqual({ expired: 1, flagged: 0 });
    expect(collaborators.updateStatus).toHaveBeenCalledWith('a', 'expired', 'system');
    expect(authentik.disableUser).toHaveBeenCalledWith('ext-a');
  });

  it('ADR-015: suspending an external also disables their company mailbox', async () => {
    const { svc, workplace } = makeService([EXPIRED]);
    await svc.sweep();
    expect(workplace.disableMailbox).toHaveBeenCalledWith('ex.a@devandre.sbs');
  });

  it('FLAGS a collaborator whose sponsor is no longer active (+ disables access)', async () => {
    const { svc, collaborators, authentik } = makeService([SPONSOR_LEFT]);
    const r = await svc.sweep();
    expect(r).toEqual({ expired: 0, flagged: 1 });
    expect(collaborators.updateStatus).toHaveBeenCalledWith('b', 'flagged', 'system');
    expect(authentik.disableUser).toHaveBeenCalledWith('ext-b');
  });

  it('leaves a healthy, in-date collaborator untouched', async () => {
    const { svc, collaborators } = makeService([HEALTHY]);
    const r = await svc.sweep();
    expect(r).toEqual({ expired: 0, flagged: 0 });
    expect(collaborators.updateStatus).not.toHaveBeenCalled();
  });

  it('expiry takes precedence over the sponsor check (one action per collaborator)', async () => {
    const { svc, collaborators } = makeService([{ ...EXPIRED, sponsorMatricule: '900099' }]);
    const r = await svc.sweep();
    expect(r).toEqual({ expired: 1, flagged: 0 });
    expect(collaborators.updateStatus).toHaveBeenCalledWith('a', 'expired', 'system');
  });
});
