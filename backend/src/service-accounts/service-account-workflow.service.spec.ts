import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ServiceAccountWorkflowService } from './service-account-workflow.service.js';

const ADMIN = '100005';
const OWNER = '100001';
const SECURITY = '900001';
const BACKUP = '900002';

function makeService() {
  const requests = {
    findOne: vi.fn(),
    create: vi.fn((x) => x),
    save: vi.fn(async (x) => ({ id: 'req-1', ...x })),
    find: vi.fn().mockResolvedValue([]),
  };
  const accounts = {
    create: vi.fn(async (i) => ({ id: 'sa-1', name: i.name, status: 'requested' })),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const config = {
    get: vi.fn((k: string) =>
      k === 'directory' ? { securityApprover: SECURITY, fallbackApprover: BACKUP } : {},
    ),
  };
  const svc = new ServiceAccountWorkflowService(
    requests as any,
    accounts as any,
    audit as any,
    config as any,
  );
  return { svc, requests, accounts, audit };
}

const BASE = {
  name: 'ktayl-qa-finance',
  displayName: 'ktayl QA Finance',
  type: 'qa' as const,
  ownerMatricule: OWNER,
  groupRefs: ['Finance'],
  justification: 'QA tester identity for the finance live-200 gate',
};

describe('ServiceAccountWorkflowService.fileRequest', () => {
  it('rejects a missing justification (422)', async () => {
    const { svc } = makeService();
    await expect(svc.fileRequest({ ...BASE, justification: '   ' }, ADMIN)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('creates the account + request with four-eyes legs (Security + owner) and audits it', async () => {
    const { svc, accounts, requests, audit } = makeService();
    const req = await svc.fileRequest(BASE, ADMIN);
    expect(accounts.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'ktayl-qa-finance', createdBy: ADMIN }));
    expect(req).toMatchObject({ securityApprover: SECURITY, ownerApprover: OWNER, status: 'pending' });
    expect(requests.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      ADMIN,
      'service_account.requested',
      'service_account_request',
      'req-1',
      expect.objectContaining({ serviceAccount: 'ktayl-qa-finance', securityApprover: SECURITY }),
    );
  });

  it('reassigns the owner leg to the backup when the owner files their own request (no self-approval)', async () => {
    const { svc } = makeService();
    const req = await svc.fileRequest(BASE, OWNER); // requester == owner
    expect(req.ownerApprover).toBe(BACKUP); // owner leg can't be the requester → backup
    expect(req.securityApprover).toBe(SECURITY);
  });
});

describe('ServiceAccountWorkflowService.decide', () => {
  let shared: any;
  beforeEach(() => {
    shared = {
      id: 'req-1',
      requesterId: ADMIN,
      serviceAccountId: 'sa-1',
      securityApprover: SECURITY,
      ownerApprover: OWNER,
      status: 'pending',
      securityDecision: null,
      ownerDecision: null,
    };
  });

  it('needs BOTH legs — one approval stays pending, both → approved', async () => {
    const { svc, requests } = makeService();
    requests.findOne.mockResolvedValue(shared);
    const afterOne = await svc.decide('req-1', SECURITY, 'approved', undefined, SECURITY);
    expect(afterOne.status).toBe('pending');
    const afterBoth = await svc.decide('req-1', OWNER, 'approved', undefined, OWNER);
    expect(afterBoth.status).toBe('approved');
  });

  it('either denial rejects the whole request', async () => {
    const { svc, requests } = makeService();
    requests.findOne.mockResolvedValue(shared);
    const r = await svc.decide('req-1', SECURITY, 'denied', 'not justified', SECURITY);
    expect(r.status).toBe('denied');
  });

  it('rejects self-approval (approver == requester)', async () => {
    const { svc, requests } = makeService();
    requests.findOne.mockResolvedValue(shared);
    await expect(svc.decide('req-1', ADMIN, 'approved', undefined, ADMIN)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a non-assigned approver', async () => {
    const { svc, requests } = makeService();
    requests.findOne.mockResolvedValue(shared);
    await expect(svc.decide('req-1', '999999', 'approved', undefined, '999999')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects deciding an already-decided request (409)', async () => {
    const { svc, requests } = makeService();
    requests.findOne.mockResolvedValue({ ...shared, status: 'approved' });
    await expect(svc.decide('req-1', SECURITY, 'approved', undefined, SECURITY)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
