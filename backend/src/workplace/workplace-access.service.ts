import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  /**
   * NOTE (ADR-016): there is deliberately NO `provisionMailbox` here. Under the Mail↔Authentik LDAP
   * federation a user's mailbox **is** their Authentik `email` — Stalwart auto-creates the box on first
   * delivery and rejects a Stalwart-side `Account/set` for an external-directory account. So "provisioning
   * a mailbox" = creating the Authentik user with `email = the company mailbox` (done by the caller via
   * `AuthentikClient.ensureUser`/`ensureExternalUser`), not a call here.
   */

  /** Add a user to the birthright `Workplace Users` group → instant access to the whole workplace suite. */
  async grantWorkplaceGroup(username: string): Promise<void> {
    await this.authentik.addUserToGroup(username, this.cfg.workplaceGroup);
  }

  /** Tear down the mailbox on offboard/suspend (best-effort — the real control is disabling the Authentik
   *  user, which blocks LDAP mail auth; this archives the Stalwart store for retention where supported). */
  async disableMailbox(workplaceEmail: string): Promise<void> {
    if (!this.stalwart.configured) return;
    try {
      await this.stalwart.disableMailbox(workplaceEmail);
    } catch (e) {
      this.log.error(`mailbox disable failed for ${workplaceEmail}: ${(e as Error).message}`);
    }
  }
}
