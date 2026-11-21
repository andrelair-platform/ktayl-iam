import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceAccountService, type CreateServiceAccountInput } from './service-account.service.js';

const ACTOR = '100001';
const INPUT: CreateServiceAccountInput = {
  name: 'ktayl-qa-finance',
  displayName: 'ktayl QA Finance',
  type: 'qa',
  ownerMatricule: '100001',
  groupRefs: ['Finance'],
  createdBy: ACTOR,
};

function makeService() {
  const repo = {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((x) => x),
    save: vi.fn(async (x) => ({ id: 'sa-1', ...x })),
    find: vi.fn().mockResolvedValue([]),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const svc = new ServiceAccountService(repo as any, audit as any);
  return { svc, repo, audit };
}

describe('ServiceAccountService.create', () => {
  it('creates a service account in `requested` status and writes an audit row', async () => {
    const { svc, repo, audit } = makeService();
    const sa = await svc.create(INPUT);
    expect(sa.id).toBe('sa-1');
    expect(sa.status).toBe('requested');
    expect(repo.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        action: 'service_account.created',
        entityType: 'service_account',
        entityId: 'sa-1',
        detail: expect.objectContaining({ name: 'ktayl-qa-finance', owner: '100001', groups: ['Finance'] }),
      }),
    );
  });

  it('rejects a duplicate name (409)', async () => {
    const { svc, repo } = makeService();
    repo.findOne.mockResolvedValue({ id: 'sa-existing', name: INPUT.name });
    await expect(svc.create(INPUT)).rejects.toBeInstanceOf(ConflictException);
  });

  it('never persists a credential value (only the entity shape)', async () => {
    const { svc } = makeService();
    const sa = await svc.create(INPUT);
    expect(sa.vaultSecretRef ?? null).toBeNull();
    expect(sa.authentikUsername ?? null).toBeNull();
  });
});

describe('ServiceAccountService.getById', () => {
  it('throws 404 when the account is missing', async () => {
    const { svc } = makeService();
    await expect(svc.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ServiceAccountService.recertify', () => {
  it('stamps last_recertified_at on an active account + audits it', async () => {
    const { svc, repo, audit } = makeService();
    repo.findOne.mockResolvedValueOnce({ id: 'sa-1', name: 'ktayl-qa-finance', ownerMatricule: '100001', status: 'active', lastRecertifiedAt: null });
    const out = await svc.recertify('sa-1', '100001');
    expect(out.lastRecertifiedAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actor: '100001', action: 'service_account.recertified', entityType: 'service_account', entityId: 'sa-1', detail: expect.objectContaining({ name: 'ktayl-qa-finance' }) }),
    );
  });

  it('refuses to recertify a non-active account (409)', async () => {
    const { svc, repo } = makeService();
    repo.findOne.mockResolvedValueOnce({ id: 'sa-1', status: 'requested', ownerMatricule: '100001' });
    await expect(svc.recertify('sa-1', '100001')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ServiceAccountService.listDueForRecertification', () => {
  it('surfaces active accounts never recertified or stale past the window', async () => {
    const { svc, repo } = makeService();
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    repo.find.mockResolvedValueOnce([
      { id: 'a', status: 'active', lastRecertifiedAt: null }, // never → due
      { id: 'b', status: 'active', lastRecertifiedAt: old }, // stale → due
      { id: 'c', status: 'active', lastRecertifiedAt: recent }, // fresh → not due
    ]);
    const due = await svc.listDueForRecertification(90);
    expect(due.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('ServiceAccountService.updateStatus', () => {
  it('flips status and audits the transition', async () => {
    const { svc, repo, audit } = makeService();
    repo.findOne.mockResolvedValue({ id: 'sa-1', name: INPUT.name, status: 'requested' });
    const sa = await svc.updateStatus('sa-1', 'active', ACTOR);
    expect(sa.status).toBe('active');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACTOR, action: 'service_account.active', entityType: 'service_account', entityId: 'sa-1', detail: {} }),
    );
  });
});
