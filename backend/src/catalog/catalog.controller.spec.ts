import { describe, it, beforeAll, afterAll, vi } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

const UUID = '11111111-1111-4111-8111-111111111111'; // valid v4 (ParseUUIDPipe accepts v3/4/5)

/**
 * Integration test: the catalog HTTP contract — routing + the global ValidationPipe (the DTO
 * rules, incl. AC-4 owner-required and the tier enum) — with the service mocked.
 */
describe('CatalogController (integration)', () => {
  let app: INestApplication;
  const service = {
    listApplications: vi.fn().mockResolvedValue([{ id: UUID, name: 'Grafana' }]),
    createApplication: vi.fn().mockResolvedValue({ id: UUID, name: 'Grafana' }),
    getApplication: vi.fn().mockResolvedValue({ id: UUID, name: 'Grafana', roles: [] }),
    listRoles: vi.fn().mockResolvedValue([]),
    addRole: vi.fn().mockResolvedValue({ id: 'role-1', name: 'grafana-admin' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /applications returns the catalog', () => {
    return request(app.getHttpServer()).get('/applications').expect(200).expect([{ id: UUID, name: 'Grafana' }]);
  });

  it('POST /applications accepts a valid body (201)', () => {
    return request(app.getHttpServer())
      .post('/applications')
      .send({ name: 'Grafana', tier: 'internal', authentikAppRef: 'grafana' })
      .expect(201);
  });

  it('POST /applications rejects an invalid tier (400)', () => {
    return request(app.getHttpServer())
      .post('/applications')
      .send({ name: 'X', tier: 'bogus', authentikAppRef: 'x' })
      .expect(400);
  });

  it('POST /applications rejects unknown properties (400)', () => {
    return request(app.getHttpServer())
      .post('/applications')
      .send({ name: 'X', tier: 'internal', authentikAppRef: 'x', hacker: true })
      .expect(400);
  });

  it('POST /applications/:id/roles rejects a role with no owner (400) — AC-4', () => {
    return request(app.getHttpServer())
      .post(`/applications/${UUID}/roles`)
      .send({ name: 'grafana-admin', authentikGroupRef: 'ktayl-observability-admin' })
      .expect(400);
  });

  it('POST /applications/:id/roles accepts a valid role (201)', () => {
    return request(app.getHttpServer())
      .post(`/applications/${UUID}/roles`)
      .send({ name: 'grafana-admin', owner: '900001', authentikGroupRef: 'ktayl-observability-admin' })
      .expect(201);
  });

  it('rejects a non-UUID application id (400)', () => {
    return request(app.getHttpServer()).get('/applications/not-a-uuid/roles').expect(400);
  });
});
