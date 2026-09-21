import { describe, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller.js';
import { AuthenticatedGuard } from './authenticated.guard.js';
import { OidcAuthGuard } from './oidc-auth.guard.js';
import { ADMIN_USER } from '../../test/fixtures/users.js';

const FRONTEND_URL = 'https://iam.example';

/**
 * Integration test: the real AuthController behind the real global AuthenticatedGuard.
 * passport's request helpers are simulated by middleware (toggled by the `x-test-auth` header),
 * and OidcAuthGuard is overridden with a stub that lets the flow through — so we exercise the
 * controller + guard wiring end-to-end over HTTP without a live Authentik/DB.
 */
describe('AuthController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'frontendUrl' ? FRONTEND_URL : undefined) } },
        { provide: APP_GUARD, useClass: AuthenticatedGuard },
      ],
    })
      .overrideGuard(OidcAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = ADMIN_USER; // simulate a successful OIDC login
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use((req: any, _res: any, next: any) => {
      const authed = req.headers['x-test-auth'] === '1';
      req.user = authed ? ADMIN_USER : undefined;
      req.isAuthenticated = () => authed;
      req.logout = (cb: (err: unknown) => void) => cb(null);
      req.session = { destroy: (cb: (err: unknown) => void) => cb(null) };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/me rejects an unauthenticated request with 401', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me returns the session user when authenticated', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('x-test-auth', '1')
      .expect(200)
      .expect(ADMIN_USER);
  });

  it('GET /auth/callback (public) redirects to the frontend after login', () => {
    return request(app.getHttpServer())
      .get('/auth/callback')
      .expect(302)
      .expect('Location', FRONTEND_URL);
  });

  it('POST /auth/logout (public) tears down the session and returns 204', () => {
    return request(app.getHttpServer()).post('/auth/logout').expect(204);
  });
});
