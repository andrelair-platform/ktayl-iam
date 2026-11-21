import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceAccountProvisioningService } from './service-account-provisioning.service.js';

const REQUESTED = {
  id: 'sa-1',
  name: 'ktayl-qa-finance',
  displayName: 'ktayl QA Finance',
  groupRefs: ['GROUP_Finance', 'GROUP_Readonly'],
  status: 'requested' as const,
};

function makeService(accountOverride: any = REQUESTED) {
  const accounts = {
    getById: vi.fn(async () => ({ ...accountOverride })),
    markProvisioned: vi.fn(async (id: string, u: string, ref: string) => ({
      ...accountOverride,
      id,
      status: 'active',
      authentikUsername: u,
      vaultSecretRef: ref,
    })),
  };
  const authentik = {
    canProvision: true,
    ensureServiceAccount: vi.fn(async () => 42),
    ensureGroup: vi.fn(async () => ({ pk: 1, name: 'g' })),
    addUserToGroup: vi.fn(async () => undefined),
    mintAppPassword: vi.fn(async () => 'ak-token-secret'),
  };
  const vault = { store: vi.fn(async (name: string) => ({ ref: `secret/platform/service-accounts/${name}`, written: true })) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const svc = new ServiceAccountProvisioningService(
    accounts as any,
    authentik as any,
    vault as any,
    audit as any,
  );
  return { svc, accounts, authentik, vault, audit };
}

describe('ServiceAccountProvisioningService', () => {
  it('provisions: Authentik user + every group + minted token → Vault → active, secret value never audited', async () => {
    const { svc, authentik, vault, accounts, audit } = makeService();
    const out = await svc.provision('sa-1', '100005');

    expect(authentik.ensureServiceAccount).toHaveBeenCalledWith('ktayl-qa-finance', 'ktayl QA Finance');
    expect(authentik.addUserToGroup).toHaveBeenCalledTimes(2); // one per group
    expect(authentik.addUserToGroup).toHaveBeenCalledWith('ktayl-qa-finance', 'GROUP_Finance');
    expect(authentik.mintAppPassword).toHaveBeenCalledWith('ktayl-qa-finance', 'sa-ktayl-qa-finance');
    expect(vault.store).toHaveBeenCalledWith('ktayl-qa-finance', { token: 'ak-token-secret', username: 'ktayl-qa-finance' });
    expect(accounts.markProvisioned).toHaveBeenCalledWith('sa-1', 'ktayl-qa-finance', 'secret/platform/service-accounts/ktayl-qa-finance');
    expect(out.status).toBe('active');

    const { action, detail } = audit.record.mock.calls.at(-1)![0];
    expect(action).toBe('service_account.provisioned');
    expect(detail.vaultSecretRef).toBe('secret/platform/service-accounts/ktayl-qa-finance');
    expect(JSON.stringify(detail)).not.toContain('ak-token-secret'); // the SECRET never reaches the audit log
  });

  it('is idempotent: an already-active account is a no-op (no Authentik writes)', async () => {
    const { svc, authentik, accounts } = makeService({ ...REQUESTED, status: 'active' });
    const out = await svc.provision('sa-1', '100005');
    expect(out.status).toBe('active');
    expect(authentik.ensureServiceAccount).not.toHaveBeenCalled();
    expect(accounts.markProvisioned).not.toHaveBeenCalled();
  });

  it('refuses to provision a disabled account (409)', async () => {
    const { svc } = makeService({ ...REQUESTED, status: 'disabled' });
    await expect(svc.provision('sa-1', '100005')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when Authentik is not configured (409)', async () => {
    const { svc, authentik } = makeService();
    authentik.canProvision = false;
    await expect(svc.provision('sa-1', '100005')).rejects.toBeInstanceOf(ConflictException);
  });

  it('config-gated Vault: store not written → still active, audit records secretWritten=false', async () => {
    const { svc, vault, audit } = makeService();
    vault.store.mockResolvedValueOnce({ ref: 'secret/platform/service-accounts/ktayl-qa-finance', written: false });
    const out = await svc.provision('sa-1', '100005');
    expect(out.status).toBe('active');
    const detail = audit.record.mock.calls.at(-1)![0].detail;
    expect(detail.secretWritten).toBe(false);
  });

  it('on failure: NOT marked active, audits provision_failed, and rethrows (retryable)', async () => {
    const { svc, authentik, accounts, audit } = makeService();
    authentik.mintAppPassword.mockRejectedValueOnce(new Error('Authentik 500'));
    await expect(svc.provision('sa-1', '100005')).rejects.toThrow('Authentik 500');
    expect(accounts.markProvisioned).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: '100005',
        action: 'service_account.provision_failed',
        entityType: 'service_account',
        entityId: 'sa-1',
        detail: expect.objectContaining({ error: 'Authentik 500' }),
      }),
    );
  });

  it('propagates a 404 for an unknown account', async () => {
    const { svc, accounts } = makeService();
    accounts.getById.mockRejectedValueOnce(new NotFoundException('nope'));
    await expect(svc.provision('ghost', '100005')).rejects.toBeInstanceOf(NotFoundException);
  });
});
