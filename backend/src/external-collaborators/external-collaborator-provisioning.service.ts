import { ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { AuthentikClient } from '../directory/authentik.client.js';
import { AuditService } from '../catalog/audit.service.js';
import { ExternalCollaboratorService } from './external-collaborator.service.js';
import type { ExternalCollaborator } from './entities/external-collaborator.entity.js';
import { ExternalCollaboratorEventPublisher } from './external-collaborator-event.publisher.js';
import { buildOnboardedEvent } from './external-collaborator-events.js';
import { WorkplaceAccessService } from '../workplace/workplace-access.service.js';

/**
 * Provisions an APPROVED external collaborator to Authentik (IGA-07/S027). Runs after the Sponsor+Security
 * dual-approval clears (S026) — best-effort from the workflow, and re-triggerable via
 * `POST /collaborators/:id/provision` if it failed. Steps:
 *   1. ensure the Authentik user (human, `external-collaborators` path),
 *   2. ensure + add it to each **scoped** `GROUP_<x>` (never birthright-plus),
 *   3. issue an **invitation/recovery link** so the human sets their own credential (no machine token),
 *   4. flip the row to `active` with `authentikUsername` (the `expires_at` was set at request time), audited.
 *
 * The invite link is NEVER stored or audited. Idempotent: an already-`active` collaborator is a no-op. A
 * failure leaves it NOT active (retryable), is audited as `external_collaborator.provision_failed`, and does
 * NOT un-approve the governance decision.
 */
@Injectable()
export class ExternalCollaboratorProvisioningService {
  private readonly log = new Logger(ExternalCollaboratorProvisioningService.name);

  constructor(
    private readonly collaborators: ExternalCollaboratorService,
    private readonly authentik: AuthentikClient,
    private readonly audit: AuditService,
    /** ADR-015 — the shared workplace tier (mailbox + birthright group), identical to an employee. */
    private readonly workplace: WorkplaceAccessService,
    /** ADR-012 onboarded-event emit. @Optional so unit tests construct the service without NATS. */
    @Optional() private readonly events?: ExternalCollaboratorEventPublisher,
  ) {}

  async provision(collaboratorId: string, actor: string): Promise<ExternalCollaborator> {
    const c = await this.collaborators.getById(collaboratorId); // 404 if missing
    if (c.status === 'active') {
      this.log.log(`external collaborator "${c.name}" already active — provisioning is a no-op`);
      return c;
    }
    if (c.status === 'disabled') {
      throw new ConflictException(`external collaborator "${c.name}" is disabled and cannot be provisioned`);
    }
    if (!this.authentik.canProvision) {
      throw new ConflictException('Authentik is not configured — cannot provision an external collaborator');
    }

    try {
      // ADR-015/016 — the WORKPLACE tier, identical to an employee. Allocate the company mailbox FIRST: under
      // the Mail↔Authentik LDAP federation the mailbox **is** the Authentik user's email (Stalwart auto-creates
      // the box on first delivery), so the Authentik user is created with `email = the company mailbox`, NOT the
      // contact address. The contact/ESN email stays IAM-only (`c.email`); the invite link is handed over
      // out-of-band, so Authentik's email needn't be reachable.
      const workplaceEmail = c.workplaceEmail ?? (await this.workplace.allocateEmail(c.displayName, c.name));
      await this.authentik.ensureExternalUser(c.name, c.displayName, workplaceEmail);
      // Scoped BUSINESS groups (named at request time) — these never become birthright (ADR-009).
      for (const group of c.groupRefs) {
        await this.authentik.ensureGroup(group);
        await this.authentik.addUserToGroup(c.name, group);
      }
      // The birthright `Workplace Users` group — collaboration baseline; business apps stay request→four-eyes.
      await this.workplace.grantWorkplaceGroup(c.name);
      // No Stalwart `createMailbox` (ADR-016) — the box auto-provisions from the Authentik email via LDAP.
      const mailboxProvisioned = true;

      // The recovery/invite link (ADR-016 recovery flow) — the external sets their own password via it.
      const invite = await this.authentik.createRecoveryLink(c.name);

      const updated = await this.collaborators.markProvisioned(c.id, c.name, {
        workplaceEmail,
        mailboxProvisioned,
      });
      await this.audit.record(actor, 'external_collaborator.provisioned', 'external_collaborator', c.id, {
        collaborator: c.name,
        authentikUsername: c.name,
        groups: c.groupRefs,
        workplaceGroup: true, // ADR-015 birthright
        mailboxProvisioned, // ADR-015 company mailbox (address not audited — minimal PII)
        expiresAt: c.expiresAt?.toISOString() ?? null,
        inviteIssued: invite !== null, // the link value is never stored/audited
      });
      this.log.log(
        `provisioned external collaborator "${c.name}" → business [${c.groupRefs.join(', ')}] + workplace birthright, mailbox ${workplaceEmail} (auto-provisions via LDAP), invite ${invite ? 'issued' : 'skipped'}`,
      );

      // ADR-012 seam: emit `onboarded` so n8n creates the non-payroll ERPNext HR worker + binds the
      // `hr_worker_ref` back (IAM never writes ERPNext). Best-effort — a publish failure never fails provisioning.
      await this.events?.emitOnboarded(buildOnboardedEvent(updated));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.audit.record(actor, 'external_collaborator.provision_failed', 'external_collaborator', c.id, {
        collaborator: c.name,
        error: message,
      });
      this.log.error(`provisioning "${c.name}" failed: ${message}`);
      throw err;
    }
  }
}
