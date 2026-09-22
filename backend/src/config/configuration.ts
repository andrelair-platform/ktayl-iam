/**
 * Typed configuration + env validation.
 * OIDC / DB / session values come from the environment (ESO→Vault in-cluster; never in Git).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  frontendUrl: string;
  sessionSecret: string;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
  };
  oidc: {
    issuer: string;
    authorizationURL: string;
    tokenURL: string;
    userInfoURL: string;
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope: string;
    adminGroup: string;
  };
  directory: {
    /** Authentik API base (read-only directory), e.g. https://auth.devandre.sbs/api/v3 */
    authentikApiUrl: string;
    authentikApiToken: string;
    /** ERPNext HR (manager source of truth). Blank creds → HR unavailable → fallback approver. */
    erpnextUrl: string;
    erpnextApiKey: string;
    erpnextApiSecret: string;
    /** Matricule that approves when a manager can't be resolved from HR (AC-4, flagged). */
    fallbackApprover: string;
  };
}

const REQUIRED = [
  'DATABASE_HOST',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
  'SESSION_SECRET',
  'AUTHENTIK_ISSUER',
  'AUTHENTIK_AUTH_URL',
  'AUTHENTIK_TOKEN_URL',
  'AUTHENTIK_USERINFO_URL',
  'AUTHENTIK_CLIENT_ID',
  'AUTHENTIK_CLIENT_SECRET',
  'AUTHENTIK_CALLBACK_URL',
] as const;

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return env;
}

export function loadConfig(): AppConfig {
  const e = process.env;
  return {
    nodeEnv: e.NODE_ENV ?? 'development',
    port: Number(e.PORT ?? 3000),
    frontendUrl: e.FRONTEND_URL ?? 'http://localhost:3001',
    sessionSecret: e.SESSION_SECRET as string,
    database: {
      host: e.DATABASE_HOST as string,
      port: Number(e.DATABASE_PORT ?? 5432),
      user: e.DATABASE_USER as string,
      password: e.DATABASE_PASSWORD as string,
      name: e.DATABASE_NAME as string,
    },
    oidc: {
      issuer: e.AUTHENTIK_ISSUER as string,
      authorizationURL: e.AUTHENTIK_AUTH_URL as string,
      tokenURL: e.AUTHENTIK_TOKEN_URL as string,
      userInfoURL: e.AUTHENTIK_USERINFO_URL as string,
      clientID: e.AUTHENTIK_CLIENT_ID as string,
      clientSecret: e.AUTHENTIK_CLIENT_SECRET as string,
      callbackURL: e.AUTHENTIK_CALLBACK_URL as string,
      scope: e.AUTHENTIK_SCOPE ?? 'openid profile email groups',
      adminGroup: e.ADMIN_GROUP ?? 'ktayl-admin',
    },
    directory: {
      authentikApiUrl: (e.AUTHENTIK_API_URL ?? authentikApiFromIssuer(e.AUTHENTIK_ISSUER)) as string,
      authentikApiToken: (e.AUTHENTIK_API_TOKEN ?? '') as string,
      erpnextUrl: (e.ERPNEXT_URL ?? '') as string,
      erpnextApiKey: (e.ERPNEXT_API_KEY ?? '') as string,
      erpnextApiSecret: (e.ERPNEXT_API_SECRET ?? '') as string,
      fallbackApprover: (e.FALLBACK_APPROVER ?? '') as string,
    },
  };
}

/** Derive the Authentik API base from the OIDC issuer origin (…/application/o/<app>/ → …/api/v3). */
function authentikApiFromIssuer(issuer?: unknown): string {
  if (typeof issuer !== 'string' || !issuer) return '';
  try {
    return `${new URL(issuer).origin}/api/v3`;
  } catch {
    return '';
  }
}
