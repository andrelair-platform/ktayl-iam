import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthentikClient } from '../directory/authentik.client.js';
import { ExternalCollaboratorService } from './external-collaborator.service.js';
import type { ExternalCollaborator } from './entities/external-collaborator.entity.js';
import { WorkplaceAccessService } from '../workplace/workplace-access.service.js';

/**
 * The external-collaborator safety net (IGA-07 / S028 auto-suspend + S029 sponsor-Leaver). A daily sweep
 * over every ACTIVE collaborator that enforces the two time-bound guards against orphaned access:
 *  - **expired** → `expires_at` has passed → suspend (status `expired` + disable the Authentik user);
 *  - **sponsor left** → the sponsor is no longer an active employee → `flagged` + disable (an admin must
 *    reassign a new sponsor or disable permanently).
 *
 * This is a **self-contained sweep** (checks the sponsor's live active status) rather than a one-shot hook
 * on the JML Leaver event — more robust: it catches a sponsor deactivated for ANY reason, and re-checks
 * every day, so a missed event can never leave orphaned access standing.
 */
@Injectable()
export class ExternalCollaboratorSentinelService {
  private readonly log = new Logger(ExternalCollaboratorSentinelService.name);

  constructor(
    private readonly collaborators: ExternalCollaboratorService,
    private readonly authentik: AuthentikClient,
    /** ADR-015 — tear down the company mailbox on suspend, mirroring the employee Leaver. */
    private readonly workplace: WorkplaceAccessService,
  ) {}

  /** Daily at 03:00 — the orphaned-access guard actually firing. Public + returns counts (testable/manual). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'ec-sentinel-sweep' })
  async sweep(): Promise<{ expired: number; flagged: number }> {
    const active = await this.collaborators.listActive();
    const now = Date.now();
    let expired = 0;
    let flagged = 0;
    for (const c of active) {
      if (c.expiresAt && c.expiresAt.getTime() < now) {
        await this.suspend(c, 'expired');
        expired++;
      } else if (
        this.authentik.configured &&
        !(await this.authentik.isActiveUser(c.sponsorMatricule))
      ) {
        await this.suspend(c, 'flagged');
        flagged++;
      }
    }
    if (expired || flagged) {
      this.log.log(`sentinel sweep: ${expired} expired-suspended, ${flagged} sponsor-left flagged`);
    }
    return { expired, flagged };
  }

  /**
   * Suspend a collaborator: flip status (audited) + disable the Authentik account (no standing access) + (ADR-015)
   * disable the company mailbox — mirroring the employee Leaver, so an offboarded external can't retain webmail.
   */
  private async suspend(c: ExternalCollaborator, status: 'expired' | 'flagged'): Promise<void> {
    await this.collaborators.updateStatus(c.id, status, 'system'); // audits external_collaborator.<status>
    if (this.authentik.configured && c.authentikUsername) {
      await this.authentik.disableUser(c.authentikUsername).catch(() => undefined);
    }
    if (c.workplaceEmail) {
      await this.workplace.disableMailbox(c.workplaceEmail); // best-effort (ADR-015)
    }
  }
}
