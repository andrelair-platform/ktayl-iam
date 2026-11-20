import { describe, it, expect, vi } from 'vitest';
import { WorkplaceAccessService } from './workplace-access.service.js';

function make(identityEmails: string[] = [], externalEmails: string[] = []) {
  const identities = {
    findOne: vi.fn(async ({ where }: any) => (identityEmails.includes(where.email) ? { email: where.email } : null)),
  };
  const externals = {
    findOne: vi.fn(async ({ where }: any) =>
      externalEmails.includes(where.workplaceEmail) ? { workplaceEmail: where.workplaceEmail } : null,
    ),
  };
  const stalwart = { configured: true, createMailbox: vi.fn(async () => true), disableMailbox: vi.fn(async () => true) };
  const authentik = { addUserToGroup: vi.fn(async () => undefined) };
  const config = { get: () => ({ mailDomain: 'devandre.sbs', workplaceGroup: 'Workplace Users', defaultMailboxPassword: '' }) };
  const svc = new WorkplaceAccessService(
    identities as any,
    externals as any,
    stalwart as any,
    authentik as any,
    config as any,
  );
  return { svc, identities, externals, stalwart, authentik };
}

describe('WorkplaceAccessService.allocateEmail (ADR-015 cross-table namespace)', () => {
  it('derives firstname.lastname when free', async () => {
    const { svc } = make();
    expect(await svc.allocateEmail('Jane Doe', 'ext-acme-jdoe')).toBe('jane.doe@devandre.sbs');
  });

  it('avoids collision with an existing EMPLOYEE of the same name (→ jane.doe2)', async () => {
    const { svc } = make(['jane.doe@devandre.sbs']);
    expect(await svc.allocateEmail('Jane Doe', 'ext-acme-jdoe')).toBe('jane.doe2@devandre.sbs');
  });

  it('avoids collision with an existing EXTERNAL of the same name (→ jane.doe2)', async () => {
    const { svc } = make([], ['jane.doe@devandre.sbs']);
    expect(await svc.allocateEmail('Jane Doe', 'ext-acme-jdoe')).toBe('jane.doe2@devandre.sbs');
  });

  it('skips multiple taken addresses across BOTH tables', async () => {
    const { svc } = make(['jane.doe@devandre.sbs'], ['jane.doe2@devandre.sbs']);
    expect(await svc.allocateEmail('Jane Doe', 'ext-acme-jdoe')).toBe('jane.doe3@devandre.sbs');
  });

  it('falls back to the unique key when the name yields no local part', async () => {
    const { svc } = make();
    expect(await svc.allocateEmail('', 'ext-acme-jdoe')).toBe('ext-acme-jdoe@devandre.sbs');
  });
});

describe('WorkplaceAccessService group + mailbox', () => {
  it('grants the birthright Workplace Users group', async () => {
    const { svc, authentik } = make();
    await svc.grantWorkplaceGroup('ext-acme-jdoe');
    expect(authentik.addUserToGroup).toHaveBeenCalledWith('ext-acme-jdoe', 'Workplace Users');
  });

  it('provisions a mailbox from the local part', async () => {
    const { svc, stalwart } = make();
    const r = await svc.provisionMailbox('jane.doe@devandre.sbs', 'Jane Doe');
    expect(stalwart.createMailbox).toHaveBeenCalledWith('jane.doe', 'Jane Doe', expect.any(String));
    expect(r.created).toBe(true);
  });

  it('disables a mailbox best-effort (swallows Stalwart errors)', async () => {
    const { svc, stalwart } = make();
    stalwart.disableMailbox.mockRejectedValueOnce(new Error('down'));
    await expect(svc.disableMailbox('jane.doe@devandre.sbs')).resolves.toBeUndefined();
  });
});
