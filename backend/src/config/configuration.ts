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
    /**
     * S008 multi-user login: if set, a user must be in this birthright/staff group (or the admin
     * group) to reach the console; if EMPTY (default) any authenticated Authentik user is admitted
     * (Authentik's app binding is the outer gate). `adminGroup` membership → AuthUser.isAdmin.
     */
    staffGroup: string;
  };
  directory: {
    /** Authentik API base (read-only directory), e.g. https://auth.devandre.sbs/api/v3 */
    authentikApiUrl: string;
    authentikApiToken: string;
    /**
     * SEPARATE, elevated Authentik token used ONLY to set a new employee's initial password at
     * onboarding (`POST /core/users/{pk}/set_password/`). Kept distinct from `authentikApiToken`
     * (which stays least-privilege, groups-only — threat T4) so the password-setting privilege is
     * isolated. Blank → the Joiner skips setting the Authentik password (logs it).
     */
    authentikCredentialToken: string;
    /** ERPNext HR (manager source of truth). Blank creds → HR unavailable → fallback approver. */
    erpnextUrl: string;
    erpnextApiKey: string;
    erpnextApiSecret: string;
    /** Matricule that approves when a manager can't be resolved from HR (AC-4, flagged). */
    fallbackApprover: string;
    /**
     * Matricule of the Security/Platform approver — the governance leg for a SERVICE-ACCOUNT request
     * (IGA-06/S022), replacing the HR-manager leg (a service account has no manager). Four-eyes still
     * applies (it must differ from the requester + the owner). Defaults to the fallback approver.
     */
    securityApprover: string;
  };
  /**
   * S023 — Vault KV-v2 write for a minted SERVICE-ACCOUNT credential. Config-gated: blank addr/token →
   * provisioning still creates the Authentik account + mints the token, but the credential is NOT
   * persisted (only the planned ref is stored on the row; a consumer's ESO ExternalSecret reads the
   * same path once a write-scoped token is wired). The write-token is least-privilege (create on
   * `secret/data/platform/service-accounts/*` only) — delivered via ESO→Vault, never in Git.
   */
  vault: {
    addr: string; // https://vault.devandre.sbs
    token: string; // write-scoped to platform/service-accounts/*
    mount: string; // secret
    basePath: string; // platform/service-accounts
  };
  workflow: {
    /**
     * DEV-ONLY: let an admin pass the acting `approver` matricule on a decision (to demo four-eyes
     * from the single admin console before multi-user login exists). The server STILL enforces
     * approver ≠ requester and approver-must-match-an-assigned-leg. Default false → prod uses the
     * real signed-in approver only.
     */
    allowApproverOverride: boolean;
  };
  sync: {
    /**
     * Authentik groups the platform EXCLUSIVELY owns — only here will the reconcile REMOVE a
     * hand-added membership. For every other governed group reconcile only RE-ADDS missing members
     * (heals hand-removal) and ALERTS on extras, so it can never nuke a hand-managed group's
     * membership (e.g. `Platform Admins`). Empty by default = safe (add + alert only). Env:
     * RECONCILE_EXCLUSIVE_GROUPS (comma-separated).
     */
    exclusiveGroups: string[];
  };
  /** S015/S016 — HR Joiner/Mover/Leaver lifecycle intake + workspace provisioning. */
  lifecycle: {
    /** NATS JetStream the ERPNext producer publishes signed J/M/L events to. Blank → consumer off. */
    natsUrl: string;
    natsStream: string; // HR_LIFECYCLE
    natsSubject: string; // hr.lifecycle.> (we filter joiner/mover/leaver)
    /** Shared HMAC-SHA256 key the producer signs with (Vault platform/hr-lifecycle). Blank → unsigned/dev. */
    signingKey: string;
    /** The all-staff birthright group a Joiner is added to → the whole workplace suite. */
    workplaceGroup: string;
    /** Stalwart mailbox provisioning (JMAP). Blank adminSecret → mailbox step skipped (logged). */
    stalwartJmapUrl: string; // http://stalwart.mail.svc:8080/jmap
    stalwartAdminUser: string; // admin
    stalwartAdminSecret: string;
    mailDomain: string; // devandre.sbs
    /**
     * MVP: shared DEFAULT initial mailbox password given to every new employee (so the mailbox + the
     * Nextcloud Mail account can be auto-provisioned with a known value). Employees rotate it to a
     * personal one later (self-service, TODO). Blank → fall back to a random per-employee password.
     * Set via env DEFAULT_MAILBOX_PASSWORD (ESO→Vault) — never hardcoded.
     */
    defaultMailboxPassword: string;
  };
  /** ADR-013 — the n8n integration seam (external-collaborator → ERPNext HR worker). */
  integration: {
    /**
     * Shared service key n8n presents as `X-IAM-Service-Key` to call the `hr-worker-ref` writeback
     * (ADR-013). From Vault→ESO. **Blank → the writeback endpoint is fail-closed** (denies all).
     */
    serviceKey: string;
    /**
     * The n8n Webhook URL IAM POSTs the signed `onboarded` event to (ADR-013). **Blank → webhook emit is
     * off** (the durable NATS publish still happens). Set via env N8N_ONBOARD_WEBHOOK_URL.
     */
    n8nOnboardWebhookUrl: string;
    /**
     * This IAM instance's own base URL (ADR-013b) — stamped into the `onboarded` event so n8n binds the HR
     * worker ref back to the RIGHT env (one n8n serves dev+prod). env IAM_CALLBACK_BASE_URL
     * (dev `https://iam-dev.10.0.0.200.nip.io`, prod `https://iam.10.0.0.200.nip.io`).
     */
    iamCallbackBaseUrl: string;
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

type Env = Record<string, string | undefined>;

function loadDatabase(e: Env): AppConfig['database'] {
  return {
    host: e.DATABASE_HOST as string,
    port: Number(e.DATABASE_PORT ?? 5432),
    user: e.DATABASE_USER as string,
    password: e.DATABASE_PASSWORD as string,
    name: e.DATABASE_NAME as string,
  };
}

function loadOidc(e: Env): AppConfig['oidc'] {
  return {
    issuer: e.AUTHENTIK_ISSUER as string,
    authorizationURL: e.AUTHENTIK_AUTH_URL as string,
    tokenURL: e.AUTHENTIK_TOKEN_URL as string,
    userInfoURL: e.AUTHENTIK_USERINFO_URL as string,
    clientID: e.AUTHENTIK_CLIENT_ID as string,
    clientSecret: e.AUTHENTIK_CLIENT_SECRET as string,
    callbackURL: e.AUTHENTIK_CALLBACK_URL as string,
    scope: e.AUTHENTIK_SCOPE ?? 'openid profile email groups',
    // Real Authentik taxonomy — the admin group is "Platform Admins" (the old `ktayl-admin`
    // default never existed and 401'd every login; the overlay already sets this).
    adminGroup: e.ADMIN_GROUP ?? 'Platform Admins',
    staffGroup: (e.STAFF_GROUP ?? '') as string, // empty = admit any authenticated user (S008)
  };
}

function loadDirectory(e: Env): AppConfig['directory'] {
  return {
    authentikApiUrl: (e.AUTHENTIK_API_URL ?? authentikApiFromIssuer(e.AUTHENTIK_ISSUER)) as string,
    authentikApiToken: (e.AUTHENTIK_API_TOKEN ?? '') as string,
    authentikCredentialToken: (e.AUTHENTIK_CREDENTIAL_TOKEN ?? '') as string,
    erpnextUrl: (e.ERPNEXT_URL ?? '') as string,
    erpnextApiKey: (e.ERPNEXT_API_KEY ?? '') as string,
    erpnextApiSecret: (e.ERPNEXT_API_SECRET ?? '') as string,
    fallbackApprover: (e.FALLBACK_APPROVER ?? '') as string,
    securityApprover: (e.SECURITY_APPROVER ?? e.FALLBACK_APPROVER ?? '') as string,
  };
}

function loadVault(e: Env): AppConfig['vault'] {
  return {
    addr: (e.VAULT_ADDR ?? '') as string,
    token: (e.VAULT_TOKEN ?? '') as string,
    mount: (e.VAULT_KV_MOUNT ?? 'secret') as string,
    basePath: (e.VAULT_SA_BASE_PATH ?? 'platform/service-accounts') as string,
  };
}

function loadSync(e: Env): AppConfig['sync'] {
  return {
    exclusiveGroups: String(e.RECONCILE_EXCLUSIVE_GROUPS ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
  };
}

function loadLifecycleMail(e: Env): Pick<
  AppConfig['lifecycle'],
  'stalwartJmapUrl' | 'stalwartAdminUser' | 'stalwartAdminSecret' | 'mailDomain' | 'defaultMailboxPassword'
> {
  return {
    stalwartJmapUrl: (e.STALWART_JMAP_URL ?? '') as string,
    stalwartAdminUser: (e.STALWART_ADMIN_USER ?? 'admin') as string,
    stalwartAdminSecret: (e.STALWART_ADMIN_SECRET ?? '') as string,
    mailDomain: (e.MAIL_DOMAIN ?? 'devandre.sbs') as string,
    defaultMailboxPassword: (e.DEFAULT_MAILBOX_PASSWORD ?? '') as string,
  };
}

function loadLifecycle(e: Env): AppConfig['lifecycle'] {
  return {
    natsUrl: (e.HR_NATS_URL ?? '') as string,
    natsStream: (e.HR_LIFECYCLE_STREAM ?? 'HR_LIFECYCLE') as string,
    natsSubject: (e.HR_LIFECYCLE_SUBJECT ?? 'hr.lifecycle.>') as string,
    signingKey: (e.HR_LIFECYCLE_SIGNING_KEY ?? '') as string,
    workplaceGroup: (e.WORKPLACE_GROUP ?? 'Workplace Users') as string,
    ...loadLifecycleMail(e),
  };
}

function loadIntegration(e: Env): AppConfig['integration'] {
  return {
    serviceKey: (e.IAM_SERVICE_KEY ?? '') as string,
    n8nOnboardWebhookUrl: (e.N8N_ONBOARD_WEBHOOK_URL ?? '') as string,
    iamCallbackBaseUrl: (e.IAM_CALLBACK_BASE_URL ?? '') as string,
  };
}

export function loadConfig(): AppConfig {
  const e = process.env;
  return {
    nodeEnv: e.NODE_ENV ?? 'development',
    port: Number(e.PORT ?? 3000),
    frontendUrl: e.FRONTEND_URL ?? 'http://localhost:3001',
    sessionSecret: e.SESSION_SECRET as string,
    database: loadDatabase(e),
    oidc: loadOidc(e),
    directory: loadDirectory(e),
    vault: loadVault(e),
    workflow: {
      allowApproverOverride: (e.ALLOW_APPROVER_OVERRIDE ?? 'false') === 'true',
    },
    sync: loadSync(e),
    lifecycle: loadLifecycle(e),
    integration: loadIntegration(e),
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
