import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthentikClient } from '../directory/authentik.client.js';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { Identity } from './entities/identity.entity.js';
import { StalwartClient } from './stalwart.client.js';
import { buildEmail, deriveLocalPart } from './email.js';

/** The normalized J/M/L event the producer emits (erpnext_hr_lifecycle, schema ktayl.hr.lifecycle/v1). */
export interface LifecycleEvent {
  event: 'joiner' | 'mover' | 'leaver';
  occurred_at?: string;
  subject: {
    matricule: string;
    employee_name?: string;
    email?: string | null;
    job?: string | null;
    department?: string | null;
    entity?: string | null;
    country?: string | null;
  };
}

/**
 * The HR↔IAM Joiner handler (S016). On a Joiner event it ONBOARDS THE IDENTITY into the IAM platform:
 *   1. derive the workplace email firstname.lastname@<domain> (collision-safe);
 *   2. provision the Stalwart mailbox;
 *   3. create the Authentik user (username = matricule) + add to the birthright `Workplace Users`
 *      group → instant access to the whole workplace suite;
 *   4. persist an Identity row (keyed by matricule) → the person becomes a requestable SUBJECT of the
 *      access-request/dual-approval flow for LOB/technical apps.
 * Fully idempotent (safe to re-process an event) and best-effort per leg (a failing leg leaves its
 * flag false so a redelivery/reconcile completes it; never partially corrupts the identity).
 * Mover/Leaver are intentionally minimal here (status update); full M/L is S017/S018.
 */
@Injectable()
export class LifecycleService {
  private readonly log = new Logger(LifecycleService.name);
  private readonly cfg: AppConfig['lifecycle'];

  constructor(
    @InjectRepository(Identity) private readonly identities: Repository<Identity>,
    private readonly authentik: AuthentikClient,
    private readonly stalwart: StalwartClient,
    config: ConfigService,
  ) {
    this.cfg = config.get<AppConfig['lifecycle']>('lifecycle')!;
  }

  async handle(ev: LifecycleEvent): Promise<void> {
    const s = ev.subject;
    if (!s?.matricule) {
      this.log.warn('lifecycle event with no matricule — ignored');
      return;
    }
    if (ev.event === 'joiner' || ev.event === 'mover') return this.onJoinerOrMover(ev);
    if (ev.event === 'leaver') return this.markLeft(ev);
    this.log.warn(`unknown lifecycle event "${ev.event}" — ignored`);
  }

  private async onJoinerOrMover(ev: LifecycleEvent): Promise<void> {
    const s = ev.subject;
    let id = await this.identities.findOne({ where: { matricule: s.matricule } });
    if (!id) {
      id = this.identities.create({ matricule: s.matricule, status: 'active' });
    }
    id.fullName = s.employee_name ?? id.fullName ?? s.matricule;
    id.department = s.department ?? id.department ?? null;
    id.entity = s.entity ?? id.entity ?? null;
    id.country = s.country ?? id.country ?? null;
    id.job = s.job ?? id.job ?? null;
    id.status = 'active';
    id.lastEventAt = ev.occurred_at ? new Date(ev.occurred_at) : new Date();

    // 1. derive the workplace email (collision-safe) — only once, kept stable afterwards
    if (!id.email) {
      id.email = await this.deriveUniqueEmail(id.fullName, s.matricule);
    }
    await this.identities.save(id); // persist early so the subject exists even if a leg later fails

    // 2. Stalwart mailbox (best-effort; skipped if Stalwart not configured)
    if (!id.mailboxProvisioned && id.email && this.stalwart.configured) {
      try {
        const localPart = id.email.split('@')[0];
        const pw = this.genPassword();
        const created = await this.stalwart.createMailbox(localPart, id.fullName, pw);
        id.mailboxProvisioned = true;
        if (created) id.initialMailboxPassword = pw; // deliver-then-rotate (MVP)
        await this.identities.save(id);
      } catch (e) {
        this.log.error(`mailbox provisioning failed for ${s.matricule}: ${(e as Error).message}`);
      }
    }

    // 3. Authentik user + birthright group (best-effort; skipped if Authentik not configured)
    if (!id.authentikProvisioned && this.authentik.configured) {
      try {
        await this.authentik.ensureUser(s.matricule, id.fullName, id.email);
        await this.authentik.addUserToGroup(s.matricule, this.cfg.workplaceGroup);
        id.authentikProvisioned = true;
        await this.identities.save(id);
      } catch (e) {
        this.log.error(`authentik provisioning failed for ${s.matricule}: ${(e as Error).message}`);
      }
    }
    this.log.log(
      `${ev.event} ${s.matricule} (${id.fullName}) → email=${id.email} mailbox=${id.mailboxProvisioned} authentik=${id.authentikProvisioned}`,
    );
  }

  private async markLeft(ev: LifecycleEvent): Promise<void> {
    const id = await this.identities.findOne({ where: { matricule: ev.subject.matricule } });
    if (!id) return; // unknown leaver — flagged, not fatal
    id.status = 'left';
    id.lastEventAt = ev.occurred_at ? new Date(ev.occurred_at) : new Date();
    await this.identities.save(id);
    // NOTE: actual access REVOCATION (Authentik disable + membership removal) is S017 (Leaver), not here.
    this.log.log(`leaver ${ev.subject.matricule} → identity marked left (deprovision = S017)`);
  }

  /** firstname.lastname@domain, appending 2/3/… if an identity already holds that address. */
  private async deriveUniqueEmail(fullName: string, matricule: string): Promise<string> {
    const base = deriveLocalPart(fullName) || `emp${matricule}`;
    for (let suffix = 0; suffix < 50; suffix++) {
      const candidate = buildEmail(base, this.cfg.mailDomain, suffix);
      const clash = await this.identities.findOne({ where: { email: candidate } });
      if (!clash) return candidate;
    }
    // pathological fallback — matricule is unique
    return buildEmail(`emp${matricule}`, this.cfg.mailDomain);
  }

  private genPassword(): string {
    // URL-safe, mixed — enough entropy for an initial mailbox password the user will rotate.
    return 'Mp' + randomBytes(15).toString('base64').replace(/[+/=]/g, '').slice(0, 18) + 'x7';
  }
}
