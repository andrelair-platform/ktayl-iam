import { describe, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DirectoryController } from './directory.controller.js';
import { AuthentikClient } from './authentik.client.js';
import { HrClient } from './hr.client.js';
import { ManagerResolverService } from './manager-resolver.service.js';

describe('DirectoryController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DirectoryController],
      providers: [
        { provide: AuthentikClient, useValue: { configured: true, listUsers: async () => [{ username: '900011', groups: [] }], listGroups: async () => [{ name: 'ktayl-engineering', memberCount: 2 }] } },
        { provide: HrClient, useValue: { configured: false } },
        { provide: ManagerResolverService, useValue: { resolveManager: async (m: string) => ({ requester: m, manager: '900001', source: 'fallback', fallback: true, reason: 'x' }) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /directory/status reports which upstreams are wired', () => {
    return request(app.getHttpServer()).get('/directory/status').expect(200).expect({ authentik: true, hr: false });
  });

  it('GET /directory/users returns the Authentik directory', () => {
    return request(app.getHttpServer()).get('/directory/users').expect(200).expect([{ username: '900011', groups: [] }]);
  });

  it('GET /directory/groups returns the Authentik groups', () => {
    return request(app.getHttpServer()).get('/directory/groups').expect(200).expect([{ name: 'ktayl-engineering', memberCount: 2 }]);
  });

  it('GET /directory/manager/:matricule returns the resolved approver #1', () => {
    return request(app.getHttpServer())
      .get('/directory/manager/900011')
      .expect(200)
      .expect({ requester: '900011', manager: '900001', source: 'fallback', fallback: true, reason: 'x' });
  });
});
