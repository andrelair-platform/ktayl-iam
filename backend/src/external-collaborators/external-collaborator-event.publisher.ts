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
  private nc: NatsConnection | null = null;

  constructor(config: ConfigService) {
    this.cfg = config.get<AppConfig['lifecycle']>('lifecycle')!;
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

  /** Publish `onboarded` (best-effort). Signs the canonical body; `msgID` = idempotencyKey (dedupe). */
  async emitOnboarded(event: ExternalCollaboratorOnboardedEvent): Promise<void> {
    if (!this.nc) {
      this.log.debug(`event publisher disabled — skipping onboarded for ${event.collaboratorId}`);
      return;
    }
    try {
      const body = canonicalJson(event);
      const h = headers();
      if (this.cfg.signingKey) {
        h.set('IAM-Signature', createHmac('sha256', this.cfg.signingKey).update(body, 'utf8').digest('hex'));
      }
      await this.nc
        .jetstream()
        .publish(EXTERNAL_COLLABORATOR_ONBOARDED_SUBJECT, new TextEncoder().encode(body), {
          headers: h,
          msgID: event.idempotencyKey,
        });
      this.log.log(`emitted external_collaborator.onboarded for ${event.collaboratorId} (${event.engagementType})`);
    } catch (e) {
      this.log.warn(`failed to emit onboarded for ${event.collaboratorId} (non-fatal): ${(e as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.nc?.drain().catch(() => undefined);
  }
}
