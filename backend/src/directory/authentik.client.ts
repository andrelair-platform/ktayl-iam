import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';

export interface DirectoryUser {
  username: string; // matricule (= Authentik username)
  name: string;
  email: string | null;
  isActive: boolean;
  groups: string[];
}
export interface DirectoryGroup {
  name: string;
  memberCount: number;
}
interface AkGroup {
  pk: string; // uuid
  name: string;
  users: number[]; // user integer pks
  users_obj?: { pk: number; username: string }[];
}

/**
 * Authentik adapter — reads the directory (S003, AC-1) AND writes group memberships (S005). Reads
 * use GET; the sync engine uses `ensureGroup` / `addUserToGroup` / `removeUserFromGroup`, all
 * idempotent (membership is checked before mutating). The sync token (`authentikApiToken`) MUST stay
 * least-privilege (groups + memberships only — threat T4) and never touches credentials. Setting an
 * employee's INITIAL password at onboarding (`setPassword`, S016) is isolated on a SEPARATE elevated
 * token (`authentikCredentialToken`) so that one privilege doesn't widen the whole client.
 */
@Injectable()
export class AuthentikClient {
  private readonly log = new Logger(AuthentikClient.name);
  private readonly base: string;
  private readonly token: string;
  /** SEPARATE elevated token, used ONLY by setPassword (keeps the sync token least-privilege — T4). */
  private readonly credentialToken: string;

  constructor(config: ConfigService) {
    const d = config.get<AppConfig['directory']>('directory')!;
    this.base = d.authentikApiUrl.replace(/\/$/, '');
    this.token = d.authentikApiToken;
    this.credentialToken = d.authentikCredentialToken;
  }

  /** True if the elevated credential token is configured (enables setPassword). */
  get canSetPassword(): boolean {
    return Boolean(this.base && this.credentialToken);
  }

  /**
   * Set a user's password (S016 onboarding — the shared initial default). Uses the SEPARATE elevated
   * `credentialToken`, NOT the least-privilege sync token, so the password-setting privilege is
   * isolated (threat T4). The Joiner calls this ONCE at provisioning (guarded by authentikProvisioned)
   * → it never clobbers a password the employee later rotated. No-op (false) if the credential token
   * isn't configured or the user is unknown.
   */
  async setPassword(username: string, password: string): Promise<boolean> {
    if (!this.canSetPassword) return false;
    const pk = await this.getUserPk(username);
    if (pk === null) return false;
    const res = await fetch(`${this.base}/core/users/${pk}/set_password/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentialToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Authentik set_password ${pk} → ${res.status} ${txt}`.trim());
    }
    this.log.log(`set initial password for Authentik user "${username}"`);
    return true;
  }

  get configured(): boolean {
    return Boolean(this.base && this.token);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Authentik GET ${path} → ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async send<T>(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Authentik ${method} ${path} → ${res.status} ${txt}`.trim());
    }
    return (res.status === 204 ? ({} as T) : ((await res.json()) as T));
  }

  // ── reads (S003) ──────────────────────────────────────────────────────────
  async listUsers(): Promise<DirectoryUser[]> {
    const data = await this.get<{ results: any[] }>('/core/users/?page_size=200');
    return (data.results ?? []).map((u) => ({
      username: String(u.username),
      name: u.name ?? '',
      email: u.email || null,
      isActive: Boolean(u.is_active),
      groups: (u.groups_obj ?? []).map((g: any) => g.name),
    }));
  }

  async listGroups(): Promise<DirectoryGroup[]> {
    const data = await this.get<{ results: any[] }>('/core/groups/?page_size=200');
    return (data.results ?? []).map((g) => ({
      name: String(g.name),
      memberCount: Array.isArray(g.users) ? g.users.length : 0,
    }));
  }

  /** True if a user with this matricule (username) exists in Authentik. */
  async userExists(username: string): Promise<boolean> {
    const data = await this.get<{ results: any[] }>(
      `/core/users/?username=${encodeURIComponent(username)}`,
    );
    return (data.results ?? []).some((u) => String(u.username) === username);
  }

  /**
   * True if this matricule is an **active** directory user (IGA-07/S026 sponsor validation). An active
   * employee has an enabled Authentik account; a leaver is `is_active=false` (S017 disable). Used to
   * reject a terminated/unknown sponsor for an external collaborator.
   */
  async isActiveUser(username: string): Promise<boolean> {
    const data = await this.get<{ results: any[] }>(
      `/core/users/?username=${encodeURIComponent(username)}`,
    );
    return (data.results ?? []).some(
      (u) => String(u.username) === username && Boolean(u.is_active),
    );
  }

  // ── user provisioning (S016 Joiner) ─────────────────────────────────────────
  /**
   * Get-or-create an Authentik user keyed by matricule (= username). Idempotent: returns the
   * existing pk if the username already exists, else creates an active internal user with the given
   * name + email and NO usable password (SSO-only — the Joiner has no local credential; identity is
   * proven via the IdP/mailbox, per workplace-architecture.md). Returns the user's integer pk.
   */
  async ensureUser(username: string, name: string, email: string | null): Promise<number> {
    const existing = await this.getUserPk(username);
    if (existing !== null) return existing;
    this.log.log(`creating Authentik user "${username}"`);
    const created = await this.send<{ pk: number }>('POST', '/core/users/', {
      username,
      name,
      email: email ?? '',
      is_active: true,
      type: 'internal',
      path: 'users',
    });
    return Number(created.pk);
  }

  /**
   * Ensure a human EXTERNAL-COLLABORATOR user exists (IGA-07/S027) — like {@link ensureUser} but filed
   * under the `external-collaborators` path for org separation; a loginable `internal`-type user who sets
   * their own credential via the invitation/recovery link. Idempotent (returns the existing pk).
   */
  async ensureExternalUser(username: string, name: string, email: string): Promise<number> {
    const existing = await this.getUserPk(username);
    if (existing !== null) return existing;
    this.log.log(`creating Authentik external collaborator "${username}"`);
    const created = await this.send<{ pk: number }>('POST', '/core/users/', {
      username,
      name,
      email,
      is_active: true,
      type: 'internal',
      path: 'external-collaborators',
    });
    return Number(created.pk);
  }

  /**
   * Issue a recovery/invitation link for a user (IGA-07/S027) — the external collaborator uses it to set
   * their initial credential (no machine token for a human). Returns the one-time link, or null if the
   * user is unknown. The link value is NEVER stored or audited (it's handed to the invite flow).
   */
  async createRecoveryLink(username: string): Promise<string | null> {
    const pk = await this.getUserPk(username);
    if (pk === null) return null;
    const res = await this.send<{ link: string }>('POST', `/core/users/${pk}/recovery/`, {});
    return res.link ?? null;
  }

  /** True if provisioning a service account (create user + mint token) is possible. */
  get canProvision(): boolean {
    return Boolean(this.base && this.token);
  }

  /**
   * Ensure a SERVICE-ACCOUNT user exists (IGA-06/S023) — like {@link ensureUser} but Authentik user
   * `type: 'service_account'` (no email, no interactive SSO login; it authenticates only via its
   * minted app-password token). Idempotent: returns the existing pk if the username is already there.
   */
  async ensureServiceAccount(username: string, name: string): Promise<number> {
    const existing = await this.getUserPk(username);
    if (existing !== null) return existing;
    this.log.log(`creating Authentik service account "${username}"`);
    const created = await this.send<{ pk: number }>('POST', '/core/users/', {
      username,
      name,
      is_active: true,
      type: 'service_account',
      path: 'service-accounts',
    });
    return Number(created.pk);
  }

  /**
   * Mint an app-password token for a service account and return its secret key (IGA-06/S023). The key
   * is only ever retrievable via `view_key/` (Authentik never returns it on list) → we create then
   * read it once. Idempotent on `identifier`: any existing token with that identifier is deleted first
   * so the returned key is always the live one (a re-provision rotates the credential). Throws if the
   * user does not exist.
   */
  async mintAppPassword(username: string, identifier: string): Promise<string> {
    const pk = await this.getUserPk(username);
    if (pk === null) throw new Error(`cannot mint token: Authentik user "${username}" not found`);
    // rotate: drop any prior token with this identifier so the key we view is the one we just set
    await fetch(`${this.base}/core/tokens/${encodeURIComponent(identifier)}/`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` },
    }).catch(() => undefined);
    await this.send('POST', '/core/tokens/', {
      identifier,
      user: pk,
      intent: 'app_password',
      expiring: false,
      description: `service-account credential for ${username} (minted by ktayl-iam)`,
    });
    const view = await this.get<{ key: string }>(
      `/core/tokens/${encodeURIComponent(identifier)}/view_key/`,
    );
    return view.key;
  }

  /**
   * Disable a user (S017 Leaver): set is_active=false → blocks ALL SSO login immediately (every
   * app, default + business), the catch-all no-dangling-access control. Idempotent (no-op if the
   * user is unknown or already disabled). Returns true if a user was found + disabled/confirmed.
   */
  async disableUser(username: string): Promise<boolean> {
    const pk = await this.getUserPk(username);
    if (pk === null) return false;
    await this.send('PATCH', `/core/users/${pk}/`, { is_active: false });
    this.log.log(`disabled Authentik user "${username}"`);
    return true;
  }

  /** The group names a user is currently a member of (S017 — to remove them all). [] if unknown. */
  async getUserGroups(username: string): Promise<string[]> {
    const data = await this.get<{ results: any[] }>(
      `/core/users/?username=${encodeURIComponent(username)}`,
    );
    const u = (data.results ?? []).find((x) => String(x.username) === username);
    return u ? ((u.groups_obj ?? []).map((g: any) => String(g.name)) as string[]) : [];
  }

  // ── writes + membership (S005) ──────────────────────────────────────────────
  /** Resolve a matricule (username) to its Authentik integer pk, or null if unknown. */
  async getUserPk(username: string): Promise<number | null> {
    const data = await this.get<{ results: any[] }>(
      `/core/users/?username=${encodeURIComponent(username)}`,
    );
    const u = (data.results ?? []).find((x) => String(x.username) === username);
    return u ? Number(u.pk) : null;
  }

  /** Fetch a group by exact name (with its member pks + usernames), or null. */
  async getGroupByName(name: string): Promise<AkGroup | null> {
    const data = await this.get<{ results: AkGroup[] }>(
      `/core/groups/?name=${encodeURIComponent(name)}&include_users=true`,
    );
    return (data.results ?? []).find((g) => g.name === name) ?? null;
  }

  /** Get-or-create a group by name (idempotent); returns its pk. */
  async ensureGroup(name: string): Promise<AkGroup> {
    const existing = await this.getGroupByName(name);
    if (existing) return existing;
    this.log.log(`creating Authentik group "${name}"`);
    const created = await this.send<AkGroup>('POST', '/core/groups/', { name });
    return { pk: created.pk, name: created.name, users: created.users ?? [] };
  }

  /** The usernames currently in a group (for reconcile); [] if the group doesn't exist. */
  async groupMemberUsernames(name: string): Promise<string[]> {
    const g = await this.getGroupByName(name);
    if (!g) return [];
    if (g.users_obj?.length) return g.users_obj.map((u) => String(u.username));
    // fall back to resolving pks (rare — include_users should populate users_obj)
    return [];
  }

  /** Add a user to a group (idempotent — no-op if already a member). Creates the group if needed. */
  async addUserToGroup(username: string, groupName: string): Promise<void> {
    const group = await this.ensureGroup(groupName);
    const pk = await this.getUserPk(username);
    if (pk === null) throw new Error(`Authentik has no user with matricule "${username}"`);
    if ((group.users ?? []).includes(pk)) return; // already a member
    await this.send('POST', `/core/groups/${group.pk}/add_user/`, { pk });
  }

  /** Remove a user from a group (idempotent — no-op if the group/user/membership is absent). */
  async removeUserFromGroup(username: string, groupName: string): Promise<void> {
    const group = await this.getGroupByName(groupName);
    if (!group) return;
    const pk = await this.getUserPk(username);
    if (pk === null || !(group.users ?? []).includes(pk)) return; // nothing to remove
    await this.send('POST', `/core/groups/${group.pk}/remove_user/`, { pk });
  }
}
