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
