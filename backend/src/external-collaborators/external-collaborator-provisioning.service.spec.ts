import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExternalCollaboratorProvisioningService } from './external-collaborator-provisioning.service.js';

const REQUESTED = {
  id: 'ec-1',
  name: 'ext-acme-jdoe',
  displayName: 'Jane Doe (Acme)',
  email: 'jane@acme.example',
  groupRefs: ['GROUP_Claims_ReadOnly'],
  status: 'requested' as const,
  expiresAt: new Date('2027-01-01T00:00:00Z'),
};

function makeService(override: any = REQUESTED) {
  const collaborators = {
    getById: vi.fn(async () => ({ ...override })),
    markProvisioned: vi.fn(async (id: string, u: string) => ({
      ...override,
      id,
      status: 'active',
      authentikUsername: u,
    })),
  };
  const authentik = {
    canProvision: true,
    ensureExternalUser: vi.fn(async () => 51),
    ensureGroup: vi.fn(async () => ({ pk: 1, name: 'g' })),
    addUserToGroup: vi.fn(async () => undefined),
    createRecoveryLink: vi.fn(async () => 'https://auth.example/recovery/abc'),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const svc = new ExternalCollaboratorProvisioningService(
    collaborators as any,
    authentik as any,
    audit as any,
  );
  return { svc, collaborators, authentik, audit };
}

describe('ExternalCollaboratorProvisioningService', () => {
  it('provisions: Authentik user + scoped groups + invite → active; the invite link is never audited', async () => {
    const { svc, authentik, collaborators, audit } = makeService();
    const out = await svc.provision('ec-1', '100005');
    expect(authentik.ensureExternalUser).toHaveBeenCalledWith('ext-acme-jdoe', 'Jane Doe (Acme)', 'jane@acme.example');
    expect(authentik.addUserToGroup).toHaveBeenCalledWith('ext-acme-jdoe', 'GROUP_Claims_ReadOnly');
    expect(authentik.createRecoveryLink).toHaveBeenCalledWith('ext-acme-jdoe');
    expect(collaborators.markProvisioned).toHaveBeenCalledWith('ec-1', 'ext-acme-jdoe');
    expect(out.status).toBe('active');
    const detail = audit.record.mock.calls.at(-1)![4];
    expect(detail.inviteIssued).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('recovery/abc'); // the link value never reaches the audit log
  });

  it('is idempotent: an already-active collaborator is a no-op', async () => {
    const { svc, authentik, collaborators } = makeService({ ...REQUESTED, status: 'active' });
    const out = await svc.provision('ec-1', '100005');
    expect(out.status).toBe('active');
    expect(authentik.ensureExternalUser).not.toHaveBeenCalled();
    expect(collaborators.markProvisioned).not.toHaveBeenCalled();
  });

  it('refuses a disabled collaborator (409)', async () => {
    const { svc } = makeService({ ...REQUESTED, status: 'disabled' });
    await expect(svc.provision('ec-1', '100005')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when Authentik is not configured (409)', async () => {
    const { svc, authentik } = makeService();
    authentik.canProvision = false;
    await expect(svc.provision('ec-1', '100005')).rejects.toBeInstanceOf(ConflictException);
  });

  it('on failure: NOT marked active, audits provision_failed, rethrows (retryable)', async () => {
    const { svc, authentik, collaborators, audit } = makeService();
    authentik.addUserToGroup.mockRejectedValueOnce(new Error('Authentik 500'));
    await expect(svc.provision('ec-1', '100005')).rejects.toThrow('Authentik 500');
    expect(collaborators.markProvisioned).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      '100005',
      'external_collaborator.provision_failed',
      'external_collaborator',
      'ec-1',
      expect.objectContaining({ error: 'Authentik 500' }),
    );
  });

  it('propagates a 404 for an unknown collaborator', async () => {
    const { svc, collaborators } = makeService();
    collaborators.getById.mockRejectedValueOnce(new NotFoundException('nope'));
    await expect(svc.provision('ghost', '100005')).rejects.toBeInstanceOf(NotFoundException);
  });
});
