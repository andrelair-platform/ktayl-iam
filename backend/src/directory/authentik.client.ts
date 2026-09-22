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

/**
 * Read-only Authentik directory adapter (AC-1) — lists the users + groups Authentik knows about.
 * Uses the ktayl-iam-svc API token; NEVER writes here (provisioning is S005). All calls are GET.
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
}
