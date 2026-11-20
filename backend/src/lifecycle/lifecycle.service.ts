import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuthentikClient } from '../directory/authentik.client.js';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { Identity } from './entities/identity.entity.js';
import { StalwartClient } from './stalwart.client.js';
import { WorkplaceAccessService } from '../workplace/workplace-access.service.js';

/** The normalized J/M/L event the producer emits (erpnext_hr_lifecycle, schema ktayl.hr.lifecycle/v1). */
export interface LifecycleEvent {
  event: 'joiner' | 'mover' | 'leaver';
  occurred_at?: string;
  /** HR effective date (relieving_date for a leaver) — drives the scheduled revocation (S017). */
  effective_date?: string | null;
  subject: {
    matricule: string;
    employee_name?: string;
    email?: string | null;
    job?: string | null;
    department?: string | null;
    entity?: string | null;
    country?: string | null;
    /** ADR-014 — ERPNext engagement type (CDI/CDD/Alternance/Stage). Optional (older producers omit it). */
    employment_type?: string | null;
    /** ADR-014 — the fixed-term contract end (ERPNext `contract_end_date`). Optional; drives access-expiry. */
    contract_end_date?: string | null;
  };
}

/** ERPNext engagement types that are FIXED-TERM — they carry a contract end that caps access (ADR-014). */
const FIXED_TERM_TYPES = new Set(['CDD', 'Alternance', 'Stage']);

/** today as YYYY-MM-DD (UTC) — the boundary for the "revoke the day AFTER the leave date" rule. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    private readonly authentik: AuthentikClient,
    private readonly stalwart: StalwartClient,
    private readonly workplace: WorkplaceAccessService,
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
    // ADR-014 — mirror the engagement. Update ONLY when the field is PRESENT in the event (an older
    // producer omits it → keep existing). A null value is meaningful (e.g. a CDD→CDI conversion clears the
    // contract end → no more scheduled expiry), so distinguish undefined (absent) from null (sent-as-empty).
    if (s.employment_type !== undefined) id.employmentType = s.employment_type ?? null;
    if (s.contract_end_date !== undefined) id.contractEndDate = s.contract_end_date ?? null;
    id.status = 'active';
    id.lastEventAt = ev.occurred_at ? new Date(ev.occurred_at) : new Date();

    // 1. derive the workplace email (collision-safe across employees AND external collaborators, ADR-015) —
    //    only once, kept stable afterwards
    if (!id.email) {
      id.email = await this.workplace.allocateEmail(id.fullName, s.matricule);
    }
    await this.identities.save(id); // persist early so the subject exists even if a leg later fails

    // 2. Authentik user + birthright group (best-effort; skipped if Authentik not configured).
    // Under the Mail↔Authentik LDAP federation (ADR-016) the user's MAILBOX **is** their Authentik email —
    // Stalwart auto-creates the box on first delivery via LDAP; IAM must NOT create a Stalwart principal
    // (`createMailbox` sets a local password → rejected for external-directory accounts, and redundant).
    // So the single provisioning action is creating the Authentik user with `email = the company mailbox`.
    if (!id.authentikProvisioned && this.authentik.configured) {
      try {
        await this.authentik.ensureUser(s.matricule, id.fullName, id.email);
        await this.authentik.addUserToGroup(s.matricule, this.cfg.workplaceGroup);
        // Set the shared INITIAL password ONCE — this block only runs the first time (authentikProvisioned
        // guards it), so a later re-process never clobbers a password the employee rotated. One credential:
        // the SSO login AND the mail login (Stalwart binds against Authentik via LDAP). Needs the elevated
        // token; a blank default → no password set → the employee uses the recovery flow (ADR-016).
        if (this.cfg.defaultMailboxPassword && this.authentik.canSetPassword) {
          await this.authentik.setPassword(s.matricule, this.cfg.defaultMailboxPassword);
          id.initialMailboxPassword = this.cfg.defaultMailboxPassword; // deliver-then-rotate (welcome flow)
        }
        id.authentikProvisioned = true;
        id.mailboxProvisioned = true; // the Authentik user carries the mailbox address → box auto-provisions
        await this.identities.save(id);
      } catch (e) {
        this.log.error(`authentik provisioning failed for ${s.matricule}: ${(e as Error).message}`);
      }
    }
    this.log.log(
      `${ev.event} ${s.matricule} (${id.fullName}) → email=${id.email} mailbox=${id.mailboxProvisioned} authentik=${id.authentikProvisioned}`,
    );

    // ADR-014 catch-up: a fixed-term engagement whose contract end is ALREADY past (e.g. a mover backdating
    // the end) → revoke now rather than wait for the daily sweep (mirrors the leaver catch-up).
    if (
      id.contractEndDate &&
      id.contractEndDate < todayStr() &&
      FIXED_TERM_TYPES.has(id.employmentType ?? '') &&
      !id.deprovisionedAt
    ) {
      this.log.log(`contract-end (catch-up) ${s.matricule} → ended ${id.contractEndDate}, revoking now`);
      await this.revokeAccess(id);
    }
  }

  /**
   * S017 Leaver — HR sets the relieving date; the system auto-revokes on the first daily sweep
   * STRICTLY AFTER that date (the day after). Here we only RECORD the schedule (status=leaving,
   * offboardDate). If the date is already past (backdated separation), revoke immediately as catch-up.
   */
  private async markLeft(ev: LifecycleEvent): Promise<void> {
    const id = await this.identities.findOne({ where: { matricule: ev.subject.matricule } });
    if (!id) {
      this.log.warn(`leaver for unknown matricule ${ev.subject.matricule} — flagged, not fatal`);
      return;
    }
    id.lastEventAt = ev.occurred_at ? new Date(ev.occurred_at) : new Date();
    // effective leave date from HR (relieving_date); fallback to the event date
    id.offboardDate = ev.effective_date || (ev.occurred_at ? ev.occurred_at.slice(0, 10) : todayStr());
    if (id.status !== 'left') id.status = 'leaving';
    await this.identities.save(id);
    this.log.log(
      `leaver ${id.matricule} → status=leaving, offboard=${id.offboardDate} (auto-revoke the day after)`,
    );
    // catch-up: a past/backdated leave date → revoke now rather than wait for the next sweep
    if (id.offboardDate < todayStr()) await this.revokeAccess(id);
  }

  /**
   * Daily sweep (S017): revoke every scheduled leaver whose offboard date has passed. `offboardDate
   * < today` means today is STRICTLY AFTER the leave date → "the next date after that date".
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'iam-leaver-sweep' })
  async processScheduledLeavers(): Promise<void> {
    const today = todayStr();
    // (a) scheduled leavers — a Leaver event set status=leaving + offboard_date (S017).
    const leavers = await this.identities.find({
      where: { status: 'leaving', offboardDate: LessThan(today) },
    });
    // (b) ADR-014 — fixed-term employees whose CONTRACT END has passed but who are still active (no Leaver
    // event fired). `contract_end_date < today` excludes NULLs (CDI/open-ended never match); the
    // FIXED_TERM_TYPES guard is defence-in-depth so a stray CDI contract date can never revoke. A renewal
    // moved the date earlier. Same revocation path as a leaver.
    const contractEnded = (
      await this.identities.find({ where: { status: 'active', contractEndDate: LessThan(today) } })
    ).filter((id) => FIXED_TERM_TYPES.has(id.employmentType ?? ''));
    const due = [...leavers, ...contractEnded];
    if (due.length) {
      this.log.log(
        `access-expiry sweep: ${leavers.length} scheduled leaver(s) + ${contractEnded.length} contract-end due for revocation`,
      );
    }
    for (const id of due) await this.revokeAccess(id);
  }

  /**
   * Revoke ALL of a leaver's access — DEFAULT (birthright) + BUSINESS — idempotently:
   *   1. revoke every active DB assignment (source of truth) + remove its business Authentik group;
   *   2. remove the user from ALL remaining Authentik groups (incl. the Workplace Users birthright);
   *   3. DISABLE the Authentik user (is_active=false) — the catch-all that blocks every SSO app;
   *   4. ARCHIVE the Stalwart mailbox (clear credentials) — blocks the residual direct IMAP/SMTP path
   *      the Authentik disable can't reach, while preserving the mail for retention.
   */
  private async revokeAccess(id: Identity): Promise<void> {
    if (id.deprovisionedAt) return; // already revoked — idempotent
    const m = id.matricule;
    const active = await this.assignments.find({ where: { userId: m, status: 'active' }, relations: { role: true } });
    for (const a of active) {
      try {
        if (a.role?.authentikGroupRef) await this.authentik.removeUserFromGroup(m, a.role.authentikGroupRef);
      } catch (e) {
        this.log.error(`revoke: remove business group failed for ${m}: ${(e as Error).message}`);
      }
      a.status = 'revoked';
      a.revokedBy = 'system-leaver';
      a.revokedAt = new Date();
      await this.assignments.save(a);
    }
    try {
      for (const g of await this.authentik.getUserGroups(m)) await this.authentik.removeUserFromGroup(m, g);
    } catch (e) {
      this.log.error(`revoke: group removal failed for ${m}: ${(e as Error).message}`);
    }
    try {
      await this.authentik.disableUser(m);
    } catch (e) {
      this.log.error(`revoke: disable user failed for ${m}: ${(e as Error).message}`);
    }
    // archive the mailbox too — Authentik disable blocks browser/SSO mail, but the Stalwart principal
    // still accepts direct IMAP/SMTP with the mailbox password until its credentials are cleared.
    if (id.email && this.stalwart.configured) {
      try {
        await this.stalwart.disableMailbox(id.email);
      } catch (e) {
        this.log.error(`revoke: disable mailbox failed for ${m}: ${(e as Error).message}`);
      }
    }
    id.status = 'left';
    id.deprovisionedAt = new Date();
    await this.identities.save(id);
    this.log.log(`leaver ${m} → ACCESS REVOKED (assignments=${active.length}, groups removed, user disabled, mailbox archived)`);
  }
}
