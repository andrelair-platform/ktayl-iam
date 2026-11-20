import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { Identity } from '../lifecycle/entities/identity.entity.js';
import { ExternalCollaborator } from '../external-collaborators/entities/external-collaborator.entity.js';
import { StalwartClient } from '../lifecycle/stalwart.client.js';
import { AuthentikClient } from '../directory/authentik.client.js';
import { allocateUniqueEmail, deriveLocalPart } from '../lifecycle/email.js';

/**
 * The single owner of the **workplace tier** (ADR-015): the company mailbox + the birthright `Workplace Users`
 * group that both an **employee** (HR Joiner) and an **external collaborator** receive identically — the
 * "M365-alternative" baseline everyone needs to collaborate, as opposed to the business/LOB apps which stay
 * request → dual-approval.
 *
 * Centralised here (not duplicated per caller) so the one thing that MUST be consistent across both populations
 * — the **workplace email namespace** — is allocated against BOTH the `identity` and `external_collaborator`
 * tables, and the mailbox/group provisioning + teardown is one code path. IAM writes its own enforcement plane
 * (Authentik + Stalwart) DIRECTLY here; n8n is only the downstream *business*-system writer (ADR-009/013).
 */
@Injectable()
export class WorkplaceAccessService {
  private readonly log = new Logger(WorkplaceAccessService.name);
  private readonly cfg: AppConfig['lifecycle'];

  constructor(
    @InjectRepository(Identity) private readonly identities: Repository<Identity>,
    @InjectRepository(ExternalCollaborator)
    private readonly externals: Repository<ExternalCollaborator>,
    private readonly stalwart: StalwartClient,
    private readonly authentik: AuthentikClient,
    config: ConfigService,
  ) {
    this.cfg = config.get<AppConfig['lifecycle']>('lifecycle')!;
  }

  /**
   * Allocate a collision-safe `firstname.lastname@<domain>` address UNIQUE across the whole workplace namespace
   * — both employees and external collaborators. `uniqueKey` (matricule / `ext-*` username) is the pathological
   * fallback. Stable once assigned (the caller persists it + passes it back on re-runs).
   */
  async allocateEmail(fullName: string, uniqueKey: string): Promise<string> {
    const base = deriveLocalPart(fullName) || uniqueKey;
    return allocateUniqueEmail(base, this.cfg.mailDomain, (email) => this.isEmailTaken(email), uniqueKey);
  }

  /** True if the address is already an employee mailbox OR an external collaborator's workplace mailbox. */
  private async isEmailTaken(email: string): Promise<boolean> {
    const [emp, ext] = await Promise.all([
      this.identities.findOne({ where: { email } }),
      this.externals.findOne({ where: { workplaceEmail: email } }),
    ]);
    return emp !== null || ext !== null;
  }

  get mailboxConfigured(): boolean {
    return this.stalwart.configured;
  }

  /**
   * Provision the Stalwart mailbox for an already-allocated workplace address (idempotent — Stalwart queries by
   * name first). Returns whether a NEW box was created + the initial password set (deliver-then-rotate MVP; a
   * blank configured default ⇒ a random one). Best-effort is the CALLER's concern (wrap in try/catch).
   */
  async provisionMailbox(workplaceEmail: string, fullName: string): Promise<{ created: boolean; password: string }> {
    const localPart = workplaceEmail.split('@')[0];
    const password = this.cfg.defaultMailboxPassword || this.genPassword();
    const created = await this.stalwart.createMailbox(localPart, fullName, password);
    return { created, password };
  }

  /** Add a user to the birthright `Workplace Users` group → instant access to the whole workplace suite. */
  async grantWorkplaceGroup(username: string): Promise<void> {
    await this.authentik.addUserToGroup(username, this.cfg.workplaceGroup);
  }

  /** Tear down the mailbox on offboard/suspend (best-effort — mirrors the employee Leaver). */
  async disableMailbox(workplaceEmail: string): Promise<void> {
    if (!this.stalwart.configured) return;
    try {
      await this.stalwart.disableMailbox(workplaceEmail);
    } catch (e) {
      this.log.error(`mailbox disable failed for ${workplaceEmail}: ${(e as Error).message}`);
    }
  }

  private genPassword(): string {
    return 'Mp' + randomBytes(15).toString('base64').replace(/[+/=]/g, '').slice(0, 18) + 'x7';
  }
}
