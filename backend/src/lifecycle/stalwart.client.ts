import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';

/**
 * Stalwart mailbox provisioning via JMAP (verified recipe — Stalwart v0.16 manages principals over
 * `POST /jmap/` with the `urn:ietf:params:jmap:principals` capability, HTTP Basic admin auth; the
 * `/api/*` REST paths 404). We resolve the domain id, then `x:Account/set { create }` a User with a
 * password credential. Idempotent: query by name first. Blank admin secret → not configured (skip).
 */
@Injectable()
export class StalwartClient {
  private readonly log = new Logger(StalwartClient.name);
  private readonly url: string;
  private readonly auth: string | null;
  private readonly domain: string;

  constructor(config: ConfigService) {
    const l = config.get<AppConfig['lifecycle']>('lifecycle')!;
    this.url = l.stalwartJmapUrl.replace(/\/$/, '');
    this.auth = l.stalwartAdminSecret
      ? 'Basic ' + Buffer.from(`${l.stalwartAdminUser}:${l.stalwartAdminSecret}`).toString('base64')
      : null;
    this.domain = l.mailDomain;
  }

  get configured(): boolean {
    return Boolean(this.url && this.auth);
  }

  private async jmap(methodCalls: unknown[]): Promise<any> {
    const res = await fetch(`${this.url}/`, {
      method: 'POST',
      headers: { Authorization: this.auth!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        using: ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap', 'urn:ietf:params:jmap:principals'],
        methodCalls,
      }),
    });
    if (!res.ok) throw new Error(`Stalwart JMAP → ${res.status} ${await res.text().catch(() => '')}`.trim());
    return res.json();
  }

  /** Resolve the management domainId for the configured mail domain (Stalwart uses short ids). */
  private async domainId(): Promise<string> {
    const r = await this.jmap([['x:Domain/query', { accountId: 'a', filter: {}, limit: 50 }, '0']]);
    const ids: string[] = r.methodResponses?.[0]?.[1]?.ids ?? [];
    // single-domain deployment → the one id; if multiple, resolve by name
    if (ids.length === 1) return ids[0];
    const got = await this.jmap([
      ['x:Domain/get', { accountId: 'a', ids, properties: ['id', 'name'] }, '0'],
    ]);
    const list = got.methodResponses?.[0]?.[1]?.list ?? [];
    const match = list.find((d: any) => d.name === this.domain);
    if (!match) throw new Error(`Stalwart: domain ${this.domain} not found`);
    return match.id;
  }

  /** True if a User principal with this email already exists. */
  async mailboxExists(email: string): Promise<boolean> {
    const r = await this.jmap([
      ['x:Account/query', { accountId: 'a', filter: { '@type': 'User' }, limit: 500 }, '0'],
      [
        'x:Account/get',
        { accountId: 'a', '#ids': { resultOf: '0', name: 'x:Account/query', path: '/ids' }, properties: ['emailAddress'] },
        '1',
      ],
    ]);
    const list = r.methodResponses?.find((m: any) => m[0] === 'x:Account/get')?.[1]?.list ?? [];
    return list.some((u: any) => String(u.emailAddress).toLowerCase() === email.toLowerCase());
  }

  /** Resolve a mailbox account id by email address, or null if not found. */
  private async accountIdByEmail(email: string): Promise<string | null> {
    const r = await this.jmap([
      ['x:Account/query', { accountId: 'a', filter: { '@type': 'User' }, limit: 500 }, '0'],
      [
        'x:Account/get',
        { accountId: 'a', '#ids': { resultOf: '0', name: 'x:Account/query', path: '/ids' }, properties: ['id', 'emailAddress'] },
        '1',
      ],
    ]);
    const list = r.methodResponses?.find((m: any) => m[0] === 'x:Account/get')?.[1]?.list ?? [];
    const u = list.find((x: any) => String(x.emailAddress).toLowerCase() === email.toLowerCase());
    return u ? String(u.id) : null;
  }

  /**
   * ARCHIVE a mailbox (S017 Leaver): clear its credentials via `x:Account/set update` → all login
   * (IMAP/SMTP/JMAP) is refused (AUTHENTICATIONFAILED) while the account + its mail are PRESERVED for
   * retention. Verified: credentials:{} blocks login, account/emailAddress kept, reversible. Idempotent
   * — no-op (false) if the mailbox doesn't exist. Returns true if it disabled an existing mailbox.
   */
  async disableMailbox(email: string): Promise<boolean> {
    const id = await this.accountIdByEmail(email);
    if (!id) return false;
    const r = await this.jmap([
      ['x:Account/set', { accountId: 'a', update: { [id]: { credentials: {} } } }, '0'],
    ]);
    const resp = r.methodResponses?.[0]?.[1];
    if (resp?.notUpdated?.[id]) throw new Error(`Stalwart disable mailbox failed: ${JSON.stringify(resp.notUpdated[id])}`);
    this.log.log(`archived mailbox ${email} (credentials cleared — login blocked, mail preserved)`);
    return true;
  }

  /**
   * Create a mailbox for `localPart`@domain with `fullName` + `password`. Idempotent — no-op (returns
   * false) if the address already exists. Returns true if it created the account.
   */
  async createMailbox(localPart: string, fullName: string, password: string): Promise<boolean> {
    const email = `${localPart}@${this.domain}`;
    if (await this.mailboxExists(email)) {
      this.log.log(`mailbox ${email} already exists — skip`);
      return false;
    }
    const domainId = await this.domainId();
    const r = await this.jmap([
      [
        'x:Account/set',
        {
          accountId: 'a',
          create: {
            'new-0': {
              '@type': 'User',
              name: localPart,
              description: fullName,
              domainId,
              credentials: { '0': { '@type': 'Password', secret: password } },
              roles: { '@type': 'User' },
              permissions: { '@type': 'Inherit' },
              encryptionAtRest: { '@type': 'Disabled' },
              locale: 'fr_FR',
            },
          },
        },
        '0',
      ],
    ]);
    const resp = r.methodResponses?.[0]?.[1];
    if (!resp?.created?.['new-0']) {
      throw new Error(`Stalwart create mailbox failed: ${JSON.stringify(resp?.notCreated ?? r)}`);
    }
    this.log.log(`created mailbox ${email}`);
    return true;
  }
}
