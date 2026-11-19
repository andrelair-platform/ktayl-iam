import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ExternalCollaboratorWorkflowService,
  EXPIRY_CEILING_DAYS,
} from './external-collaborator-workflow.service.js';

const ADMIN = '100005';
const SPONSOR = '100006';
const SECURITY = '900001';
const BACKUP = '900002';

function makeService() {
  const requests = {
    findOne: vi.fn(),
    create: vi.fn((x) => x),
    save: vi.fn(async (x) => ({ id: 'req-1', ...x })),
    find: vi.fn().mockResolvedValue([]),
  };
  const collaborators = {
    create: vi.fn(async (i: any) => ({ id: 'ec-1', name: i.name, purpose: i.purpose, expiresAt: i.expiresAt })),
  };
  const authentik = { configured: true, isActiveUser: vi.fn(async () => true) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const config = {
    get: vi.fn((k: string) =>
      k === 'directory' ? { securityApprover: SECURITY, fallbackApprover: BACKUP } : {},
    ),
  };
  const svc = new ExternalCollaboratorWorkflowService(
    requests as any,
    collaborators as any,
    authentik as any,
    audit as any,
    config as any,
  );
  return { svc, requests, collaborators, authentik, audit };
}

const BASE = {
  name: 'ext-acme-jdoe',
  displayName: 'Jane Doe (Acme)',
  email: 'jane@acme.example',
  type: 'contractor' as const,
  sponsorMatricule: SPONSOR,
  groupRefs: ['GROUP_Claims_ReadOnly'],
  purpose: 'External pentest of the claims API',
};

describe('ExternalCollaboratorWorkflowService.fileRequest', () => {
  it('rejects a missing purpose (422)', async () => {
    const { svc } = makeService();
    await expect(svc.fileRequest({ ...BASE, purpose: '  ' }, ADMIN)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects an inactive/unknown sponsor (422)', async () => {
    const { svc, authentik } = makeService();
    authentik.isActiveUser.mockResolvedValueOnce(false);
    await expect(svc.fileRequest(BASE, ADMIN)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('creates the collaborator + request with Sponsor + Security legs and audits it', async () => {
    const { svc, collaborators, audit } = makeService();
    const req = await svc.fileRequest(BASE, ADMIN);
    expect(collaborators.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ext-acme-jdoe', sponsorMatricule: SPONSOR, createdBy: ADMIN }),
    );
    expect(req).toMatchObject({ securityApprover: SECURITY, sponsorApprover: SPONSOR, status: 'pending' });
    expect(audit.record).toHaveBeenCalledWith(
      ADMIN,
      'external_collaborator.requested',
      'external_collaborator_request',
      'req-1',
      expect.objectContaining({ sponsor: SPONSOR, securityApprover: SECURITY }),
    );
  });

  it('caps the expiry at the hard ceiling (180 days)', async () => {
    const { svc, collaborators } = makeService();
    await svc.fileRequest({ ...BASE, expiryDays: 365 }, ADMIN);
    const expiresAt: Date = collaborators.create.mock.calls[0][0].expiresAt;
    const days = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeLessThanOrEqual(EXPIRY_CEILING_DAYS + 0.1);
    expect(days).toBeGreaterThan(EXPIRY_CEILING_DAYS - 1);
  });

  it('skips the sponsor check when Authentik is not configured (dev)', async () => {
    const { svc, authentik } = makeService();
    authentik.configured = false;
    const req = await svc.fileRequest(BASE, ADMIN);
    expect(req.status).toBe('pending');
    expect(authentik.isActiveUser).not.toHaveBeenCalled();
  });
});

describe('ExternalCollaboratorWorkflowService.decide', () => {
  let shared: any;
  beforeEach(() => {
    shared = {
      id: 'req-1',
      requesterId: ADMIN,
      collaboratorId: 'ec-1',
      securityApprover: SECURITY,
      sponsorApprover: SPONSOR,
      status: 'pending',
      securityDecision: null,
      sponsorDecision: null,
    };
  });

  it('needs BOTH legs — one approval stays pending, both → approved', async () => {
    const { svc, requests } = makeService();
    requests.findOne.mockResolvedValue(shared);
    const afterOne = await svc.decide('req-1', SECURITY, 'approved', undefined, SECURITY);
    expect(afterOne.status).toBe('pending');
    const afterBoth = await svc.decide('req-1', SPONSOR, 'approved', undefined, SPONSOR);
    expect(afterBoth.status).toBe('approved');
  });

  it('either denial rejects the whole request', async () => {
    const { svc, requests } = makeService();
    requests.findOne.mockResolvedValue(shared);
    const r = await svc.decide('req-1', SPONSOR, 'denied', 'scope too broad', SPONSOR);
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
