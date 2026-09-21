import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

const ACTOR = '900001';
const APP = { id: 'app-1', name: 'Grafana', tier: 'internal', authentikAppRef: 'grafana' };

function makeService() {
  const apps = {
    exists: vi.fn().mockResolvedValue(false),
    create: vi.fn((x) => x),
    save: vi.fn(async (x) => ({ id: 'app-1', ...x })),
    findOne: vi.fn().mockResolvedValue(APP),
    find: vi.fn().mockResolvedValue([APP]),
  };
  const roles = {
    exists: vi.fn().mockResolvedValue(false),
    create: vi.fn((x) => x),
    save: vi.fn(async (x) => ({ id: 'role-1', ...x })),
    find: vi.fn().mockResolvedValue([]),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const svc = new CatalogService(apps as any, roles as any, audit as any);
  return { svc, apps, roles, audit };
}

describe('CatalogService.createApplication', () => {
  it('creates an app and writes an audit row', async () => {
    const { svc, audit } = makeService();
    const app = await svc.createApplication(
      { name: 'Grafana', tier: 'internal', authentikAppRef: 'grafana' },
      ACTOR,
    );
    expect(app.id).toBe('app-1');
    expect(audit.record).toHaveBeenCalledWith(ACTOR, 'application.created', 'application', 'app-1', expect.any(Object));
  });

  it('rejects a duplicate application name (409)', async () => {
    const { svc, apps } = makeService();
    apps.exists.mockResolvedValue(true);
    await expect(
      svc.createApplication({ name: 'Grafana', tier: 'internal', authentikAppRef: 'grafana' }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CatalogService.addRole', () => {
  const ROLE = { name: 'grafana-admin', owner: '900001', authentikGroupRef: 'ktayl-observability-admin' };

  it('adds a role with an owner and audits it', async () => {
    const { svc, roles, audit } = makeService();
    const role = await svc.addRole('app-1', ROLE, ACTOR);
    expect(role).toMatchObject({ owner: '900001', authentikGroupRef: 'ktayl-observability-admin' });
    expect(roles.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(ACTOR, 'role.created', 'role', 'role-1', expect.objectContaining({ owner: '900001' }));
  });

  it('AC-4: rejects a role with no owner (400) and never persists it', async () => {
    const { svc, roles } = makeService();
    await expect(svc.addRole('app-1', { ...ROLE, owner: '   ' }, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(roles.save).not.toHaveBeenCalled();
  });

  it('rejects when the application does not exist (404)', async () => {
    const { svc, apps } = makeService();
    apps.findOne.mockResolvedValue(null);
    await expect(svc.addRole('missing', ROLE, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a duplicate role name within the app (409)', async () => {
    const { svc, roles } = makeService();
    roles.exists.mockResolvedValue(true);
    await expect(svc.addRole('app-1', ROLE, ACTOR)).rejects.toBeInstanceOf(ConflictException);
  });
});
