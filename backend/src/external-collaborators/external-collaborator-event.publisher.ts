import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { connect, headers, type NatsConnection } from 'nats';
import type { AppConfig } from '../config/configuration.js';
import { canonicalJson } from '../lifecycle/hmac.js';
import {
  EXTERNAL_COLLABORATOR_ONBOARDED_SUBJECT,
  IAM_EVENTS_STREAM,
  IAM_EVENTS_SUBJECTS,
  type ExternalCollaboratorOnboardedEvent,
} from './external-collaborator-events.js';

/**
 * Publishes the IAM→integration `external_collaborator.onboarded` event (ADR-012 seam) to JetStream so
 * **n8n** can create the non-payroll ERPNext HR worker + bind the id back. Reuses the HR-lifecycle NATS URL
 * + signing key (the event carries an `IAM-Signature` HMAC the consumer verifies, mirroring the J/M/L
 * backbone). **Best-effort by design:** a publish failure is logged, never thrown into the provisioning
 * flow (like the invite link) — the collaborator is still provisioned; the HR worker is a downstream side
 * effect that n8n can also reconcile. **No-op when `HR_NATS_URL` is blank** (dev / NATS-less).
 *
 * The stream is ensured idempotently here so the publisher is self-contained; it can later move to infra
 * (the HR_LIFECYCLE stream is init-job-created) — Step 4.
 */
@Injectable()
export class ExternalCollaboratorEventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ExternalCollaboratorEventPublisher.name);
  private readonly cfg: AppConfig['lifecycle'];
  private readonly webhookUrl: string;
  private nc: NatsConnection | null = null;

  constructor(config: ConfigService) {
    this.cfg = config.get<AppConfig['lifecycle']>('lifecycle')!;
    this.webhookUrl = config.get<AppConfig['integration']>('integration')!.n8nOnboardWebhookUrl;
  }

  /** HMAC-SHA256 hex over the canonical body with the shared signing key (blank key → no signature). */
  private sign(body: string): string | null {
    return this.cfg.signingKey
      ? createHmac('sha256', this.cfg.signingKey).update(body, 'utf8').digest('hex')
      : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.cfg.natsUrl) {
      this.log.warn('HR_NATS_URL blank — external-collaborator event publisher disabled (no-op)');
      return;
    }
    try {
      this.nc = await connect({ servers: this.cfg.natsUrl, name: 'ktayl-iam-events' });
      const jsm = await this.nc.jetstreamManager();
      await jsm.streams
        .add({ name: IAM_EVENTS_STREAM, subjects: IAM_EVENTS_SUBJECTS })
        .catch((e: Error) => {
          if (!/already in use|exists/i.test(e.message)) throw e;
        });
      this.log.log(`external-collaborator event publisher ready (stream ${IAM_EVENTS_STREAM})`);
    } catch (e) {
      this.log.error(`failed to start event publisher: ${(e as Error).message}`);
      this.nc = null;
    }
  }

  /**
   * Emit `onboarded` (best-effort, never throws): (1) durable JetStream publish to `IAM_EVENTS`, and
   * (2) the ADR-013 **n8n webhook POST** (the actual trigger — n8n is webhook-native). Both are
   * independently guarded so one being off/failing doesn't block the other.
   */
  async emitOnboarded(event: ExternalCollaboratorOnboardedEvent): Promise<void> {
    const body = canonicalJson(event);
    const signature = this.sign(body);

    // (1) durable NATS log
    if (this.nc) {
      try {
        const h = headers();
        if (signature) h.set('IAM-Signature', signature);
        await this.nc
          .jetstream()
          .publish(EXTERNAL_COLLABORATOR_ONBOARDED_SUBJECT, new TextEncoder().encode(body), {
            headers: h,
            msgID: event.idempotencyKey,
          });
        this.log.log(`emitted external_collaborator.onboarded (NATS) for ${event.collaboratorId} (${event.engagementType})`);
      } catch (e) {
        this.log.warn(`NATS emit failed for ${event.collaboratorId} (non-fatal): ${(e as Error).message}`);
      }
    }

    // (2) n8n webhook trigger (ADR-013) — off when the URL is blank
    if (this.webhookUrl) {
      try {
        const res = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(signature ? { 'IAM-Signature': signature } : {}),
          },
          body,
        });
        if (!res.ok) throw new Error(`webhook responded ${res.status}`);
        this.log.log(`posted onboarded webhook to n8n for ${event.collaboratorId}`);
      } catch (e) {
        this.log.warn(`n8n webhook POST failed for ${event.collaboratorId} (non-fatal): ${(e as Error).message}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.nc?.drain().catch(() => undefined);
  }
}
