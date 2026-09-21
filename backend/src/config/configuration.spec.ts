import { describe, it, expect, afterEach } from 'vitest';
import { validateEnv, loadConfig } from './configuration.js';

const COMPLETE_ENV: Record<string, string> = {
  DATABASE_HOST: 'db',
  DATABASE_USER: 'ktayl_iam',
  DATABASE_PASSWORD: 'secret',
  DATABASE_NAME: 'ktayl_iam',
  SESSION_SECRET: 'sess',
  AUTHENTIK_ISSUER: 'https://auth.example/application/o/ktayl-iam/',
  AUTHENTIK_AUTH_URL: 'https://auth.example/application/o/authorize/',
  AUTHENTIK_TOKEN_URL: 'https://auth.example/application/o/token/',
  AUTHENTIK_USERINFO_URL: 'https://auth.example/application/o/userinfo/',
  AUTHENTIK_CLIENT_ID: 'cid',
  AUTHENTIK_CLIENT_SECRET: 'csecret',
  AUTHENTIK_CALLBACK_URL: 'https://iam.example/api/auth/callback',
};

describe('validateEnv', () => {
  it('passes when all required vars are present', () => {
    expect(() => validateEnv(COMPLETE_ENV)).not.toThrow();
  });

  it('throws listing every missing required var', () => {
    const partial = { ...COMPLETE_ENV };
    delete partial.DATABASE_PASSWORD;
    delete partial.AUTHENTIK_CLIENT_SECRET;
    expect(() => validateEnv(partial)).toThrowError(/DATABASE_PASSWORD/);
    expect(() => validateEnv(partial)).toThrowError(/AUTHENTIK_CLIENT_SECRET/);
  });

  it('treats an empty-string value as missing', () => {
    expect(() => validateEnv({ ...COMPLETE_ENV, SESSION_SECRET: '' })).toThrowError(
      /SESSION_SECRET/,
    );
  });
});

describe('loadConfig', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('maps the environment onto the typed AppConfig', () => {
    Object.assign(process.env, COMPLETE_ENV, {
      NODE_ENV: 'production',
      PORT: '3000',
      FRONTEND_URL: 'https://iam.example',
      ADMIN_GROUP: 'Platform Admins',
      AUTHENTIK_SCOPE: 'profile email groups',
    });
    const cfg = loadConfig();
    expect(cfg.nodeEnv).toBe('production');
    expect(cfg.port).toBe(3000);
    expect(cfg.database).toMatchObject({ host: 'db', user: 'ktayl_iam', port: 5432 });
    expect(cfg.oidc.adminGroup).toBe('Platform Admins');
    expect(cfg.oidc.clientID).toBe('cid');
  });

  it('applies sane defaults for the optional vars', () => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('AUTHENTIK_') || k.startsWith('DATABASE_') || ['PORT', 'FRONTEND_URL', 'ADMIN_GROUP', 'NODE_ENV'].includes(k)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, COMPLETE_ENV);
    delete process.env.PORT;
    delete process.env.FRONTEND_URL;
    delete process.env.ADMIN_GROUP;
    const cfg = loadConfig();
    expect(cfg.port).toBe(3000);
    expect(cfg.database.port).toBe(5432);
    expect(cfg.oidc.scope).toBe('openid profile email groups');
  });
});
