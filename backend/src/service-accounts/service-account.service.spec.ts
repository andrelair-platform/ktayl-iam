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
      ACTOR,
      'service_account.created',
      'service_account',
      'sa-1',
      expect.objectContaining({ name: 'ktayl-qa-finance', owner: '100001', groups: ['Finance'] }),
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

describe('ServiceAccountService.updateStatus', () => {
  it('flips status and audits the transition', async () => {
    const { svc, repo, audit } = makeService();
    repo.findOne.mockResolvedValue({ id: 'sa-1', name: INPUT.name, status: 'requested' });
    const sa = await svc.updateStatus('sa-1', 'active', ACTOR);
    expect(sa.status).toBe('active');
    expect(audit.record).toHaveBeenCalledWith(ACTOR, 'service_account.active', 'service_account', 'sa-1', {});
  });
});
