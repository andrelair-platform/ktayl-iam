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
 * idempotent (membership is checked before mutating). Auth is the `ktayl-iam-svc` token, which MUST
 * be least-privilege (groups + memberships only — threat T4); this client never touches flows,
 * providers, or user credentials.
 */
@Injectable()
export class AuthentikClient {
  private readonly log = new Logger(AuthentikClient.name);
  private readonly base: string;
  private readonly token: string;

  constructor(config: ConfigService) {
    const d = config.get<AppConfig['directory']>('directory')!;
    this.base = d.authentikApiUrl.replace(/\/$/, '');
    this.token = d.authentikApiToken;
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
