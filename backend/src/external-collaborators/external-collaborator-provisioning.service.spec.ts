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
  workplaceEmail: null,
  mailboxProvisioned: false,
};

function makeService(override: any = REQUESTED) {
  const collaborators = {
    getById: vi.fn(async () => ({ ...override })),
    markProvisioned: vi.fn(async (id: string, u: string, workplace?: any) => ({
      ...override,
      id,
      status: 'active',
      authentikUsername: u,
      ...workplace,
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
  const events = { emitOnboarded: vi.fn().mockResolvedValue(undefined) };
  // ADR-015/016 workplace tier (birthright group + allocate the mailbox address), shared with the Joiner
  const workplace = {
    grantWorkplaceGroup: vi.fn(async () => undefined),
    allocateEmail: vi.fn(async () => 'jane.doe@devandre.sbs'),
    disableMailbox: vi.fn(async () => undefined),
  };
  const svc = new ExternalCollaboratorProvisioningService(
    collaborators as any,
    authentik as any,
    audit as any,
    workplace as any,
    events as any,
  );
  return { svc, collaborators, authentik, audit, events, workplace };
}

describe('ExternalCollaboratorProvisioningService', () => {
  it('provisions: Authentik user + scoped groups + invite → active; the invite link is never audited', async () => {
    const { svc, authentik, collaborators, audit } = makeService();
    const out = await svc.provision('ec-1', '100005');
    // ADR-016: the Authentik user email = the COMPANY mailbox (allocated), not the contact address
    expect(authentik.ensureExternalUser).toHaveBeenCalledWith('ext-acme-jdoe', 'Jane Doe (Acme)', 'jane.doe@devandre.sbs');
    expect(authentik.addUserToGroup).toHaveBeenCalledWith('ext-acme-jdoe', 'GROUP_Claims_ReadOnly');
    expect(authentik.createRecoveryLink).toHaveBeenCalledWith('ext-acme-jdoe');
    expect(collaborators.markProvisioned).toHaveBeenCalledWith('ec-1', 'ext-acme-jdoe', {
      workplaceEmail: 'jane.doe@devandre.sbs',
      mailboxProvisioned: true,
    });
    expect(out.status).toBe('active');
    const detail = audit.record.mock.calls.at(-1)![4];
    expect(detail.inviteIssued).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('recovery/abc'); // the link value never reaches the audit log
  });

  // ADR-015/016 — an external collaborator gets the SAME workplace tier as an employee.
  it('ADR-015: grants the Workplace Users birthright + a company mailbox (= Authentik email), keeps business scoped', async () => {
    const { svc, authentik, workplace, audit } = makeService();
    await svc.provision('ec-1', '100005');
    expect(workplace.grantWorkplaceGroup).toHaveBeenCalledWith('ext-acme-jdoe'); // birthright
    expect(workplace.allocateEmail).toHaveBeenCalledWith('Jane Doe (Acme)', 'ext-acme-jdoe');
    // ADR-016: NO Stalwart createMailbox — the box auto-provisions from the Authentik email via LDAP
    expect((workplace as any).provisionMailbox).toBeUndefined();
    // business access is STILL only the scoped group — no business birthright
    expect(authentik.addUserToGroup).toHaveBeenCalledWith('ext-acme-jdoe', 'GROUP_Claims_ReadOnly');
    // the Authentik user email IS the company mailbox (so the box resolves via LDAP)
    expect(authentik.ensureExternalUser).toHaveBeenCalledWith('ext-acme-jdoe', 'Jane Doe (Acme)', 'jane.doe@devandre.sbs');
    const detail = audit.record.mock.calls.at(-1)![4];
    expect(detail.workplaceGroup).toBe(true);
    expect(detail.mailboxProvisioned).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('jane.doe@devandre.sbs'); // mailbox address not in the audit (minimal PII)
  });

  it('ADR-016: re-provision does not re-allocate the mailbox (idempotent — reuses the stored address)', async () => {
    const already = { ...REQUESTED, workplaceEmail: 'jane.doe@devandre.sbs', mailboxProvisioned: true };
    const { svc, workplace, authentik } = makeService(already);
    await svc.provision('ec-1', '100005');
    expect(workplace.allocateEmail).not.toHaveBeenCalled(); // address already allocated
    expect(authentik.ensureExternalUser).toHaveBeenCalledWith('ext-acme-jdoe', 'Jane Doe (Acme)', 'jane.doe@devandre.sbs');
    expect(workplace.grantWorkplaceGroup).toHaveBeenCalled(); // group add is itself idempotent
  });

  it('emits the ADR-012 onboarded event after provisioning (engagementType from the firm)', async () => {
    const { svc, events } = makeService({ ...REQUESTED, company: 'Acme Pentest Ltd' });
    await svc.provision('ec-1', '100005');
    expect(events.emitOnboarded).toHaveBeenCalledTimes(1);
    const ev = events.emitOnboarded.mock.calls[0][0];
    expect(ev).toMatchObject({
      event: 'external_collaborator.onboarded',
      idempotencyKey: 'ec-1',
      engagementType: 'Prestataire',
      firm: 'Acme Pentest Ltd',
    });

    const { svc: s2, events: e2 } = makeService({ ...REQUESTED, company: null }); // freelance
    await s2.provision('ec-1', '100005');
    expect(e2.emitOnboarded.mock.calls[0][0]).toMatchObject({ engagementType: 'Freelance', firm: null });
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
