import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  ExternalCollaboratorService,
  type CreateExternalCollaboratorInput,
} from './external-collaborator.service.js';

const ACTOR = '100001';
const INPUT: CreateExternalCollaboratorInput = {
  name: 'ext-acme-jdoe',
  displayName: 'Jane Doe (Acme)',
  email: 'jane.doe@acme.example',
  type: 'contractor',
  sponsorMatricule: '100006',
  purpose: 'External pentest of the claims API',
  groupRefs: ['GROUP_Claims_ReadOnly'],
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  createdBy: ACTOR,
};

function makeService() {
  const repo = {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((x) => x),
    save: vi.fn(async (x) => ({ id: 'ec-1', ...x })),
    find: vi.fn().mockResolvedValue([]),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const svc = new ExternalCollaboratorService(repo as any, audit as any);
  return { svc, repo, audit };
}

describe('ExternalCollaboratorService.create', () => {
  it('creates a collaborator in `requested` status and writes an audit row (sponsor + expiry)', async () => {
    const { svc, audit } = makeService();
    const c = await svc.create(INPUT);
    expect(c.status).toBe('requested');
    expect(audit.record).toHaveBeenCalledWith(
      ACTOR,
      'external_collaborator.created',
      'external_collaborator',
      'ec-1',
      expect.objectContaining({ name: 'ext-acme-jdoe', sponsor: '100006' }),
    );
  });

  it('rejects a duplicate name (409)', async () => {
    const { svc, repo } = makeService();
    repo.findOne.mockResolvedValueOnce({ id: 'existing' });
    await expect(svc.create(INPUT)).rejects.toBeInstanceOf(ConflictException);
  });

  it('captures the company when given, and records `freelance` when omitted', async () => {
    const { svc, repo, audit } = makeService();
    await svc.create({ ...INPUT, company: "Acme Pentest Ltd" });
    expect(repo.create.mock.calls[0][0].company).toBe("Acme Pentest Ltd");
    expect(audit.record.mock.calls[0][4]).toMatchObject({ company: "Acme Pentest Ltd" });

    const { svc: svc2, repo: repo2, audit: audit2 } = makeService();
    await svc2.create(INPUT); // no company
    expect(repo2.create.mock.calls[0][0].company).toBeNull();
    expect(audit2.record.mock.calls[0][4]).toMatchObject({ company: "freelance" });
  });

  it('captures the pay-link (supplierRef) when given, and stores null when omitted (ADR-010)', async () => {
    const { svc, repo, audit } = makeService();
    await svc.create({ ...INPUT, supplierRef: 'SUP-00042' });
    expect(repo.create.mock.calls[0][0].supplierRef).toBe('SUP-00042');
    expect(audit.record.mock.calls[0][4]).toMatchObject({ supplierRef: 'SUP-00042' });

    const { svc: svc2, repo: repo2, audit: audit2 } = makeService();
    await svc2.create(INPUT); // no supplierRef
    expect(repo2.create.mock.calls[0][0].supplierRef).toBeNull();
    expect(audit2.record.mock.calls[0][4]).toMatchObject({ supplierRef: null });
  });

  it('never stores a credential value (only the governance shape)', async () => {
    const { svc, repo } = makeService();
    await svc.create(INPUT);
    const saved = repo.create.mock.calls[0][0];
    expect(JSON.stringify(saved)).not.toMatch(/password|token|secret/i);
  });
});

describe('ExternalCollaboratorService.getById', () => {
  it('throws 404 when the collaborator is missing', async () => {
    const { svc } = makeService();
    await expect(svc.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ExternalCollaboratorService.updateStatus', () => {
  it('flips status and audits the transition', async () => {
    const { svc, repo, audit } = makeService();
    repo.findOne.mockResolvedValueOnce({ id: 'ec-1', status: 'active' });
    const out = await svc.updateStatus('ec-1', 'expired', ACTOR);
    expect(out.status).toBe('expired');
    expect(audit.record).toHaveBeenCalledWith(
      ACTOR,
      'external_collaborator.expired',
      'external_collaborator',
      'ec-1',
      {},
    );
  });
});

describe('ExternalCollaboratorService.renew', () => {
  it('extends expiry + stamps recert on an active collaborator (capped at 180d) + audits', async () => {
    const { svc, repo, audit } = makeService();
    repo.findOne.mockResolvedValueOnce({ id: 'ec-1', status: 'active', expiresAt: new Date(), lastRecertifiedAt: null });
    const out = await svc.renew('ec-1', ACTOR, 365);
    const days = (out.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeLessThanOrEqual(180.1);
    expect(days).toBeGreaterThan(179);
    expect(out.lastRecertifiedAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith(ACTOR, 'external_collaborator.renewed', 'external_collaborator', 'ec-1', expect.objectContaining({ days: 180 }));
  });

  it('refuses to renew a non-active collaborator (409)', async () => {
    const { svc, repo } = makeService();
    repo.findOne.mockResolvedValueOnce({ id: 'ec-1', status: 'expired' });
    await expect(svc.renew('ec-1', ACTOR)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ExternalCollaboratorService.listDueForRenewal', () => {
  it('surfaces active collaborators expiring within the window (incl. past)', async () => {
    const { svc, repo } = makeService();
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const far = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    repo.find.mockResolvedValueOnce([
      { id: 'a', status: 'active', expiresAt: soon }, // within 30 → due
      { id: 'b', status: 'active', expiresAt: far }, // beyond → not due
    ]);
    const due = await svc.listDueForRenewal(30);
    expect(due.map((c) => c.id)).toEqual(['a']);
  });
});
