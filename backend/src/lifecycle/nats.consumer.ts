import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type NatsConnection, type JsMsg } from 'nats';
import type { AppConfig } from '../config/configuration.js';
import { verifyRawSignature } from './hmac.js';
import { LifecycleService, type LifecycleEvent } from './lifecycle.service.js';

/**
 * Durable JetStream consumer of the HR_LIFECYCLE stream (the signed J/M/L backbone the ERPNext
 * producer publishes to). This is the ACCESS fan-out: ERPNext/n8n NEVER write Authentik — only
 * ktayl-iam reacts to these events for access/identity. Each message's `HR-Signature` header is
 * verified (HMAC-SHA256 over the raw canonical body) before acting; good messages are processed by
 * LifecycleService then ack'd, forged ones term'd, transient failures nak'd for redelivery.
 * Disabled (no connect) when HR_NATS_URL is blank.
 */
@Injectable()
export class HrLifecycleConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(HrLifecycleConsumer.name);
  private readonly cfg: AppConfig['lifecycle'];
  private nc: NatsConnection | null = null;
  private stop = false;
  private static readonly DURABLE = 'ktayl-iam-joiner';

  constructor(config: ConfigService, private readonly svc: LifecycleService) {
    this.cfg = config.get<AppConfig['lifecycle']>('lifecycle')!;
  }

  async onModuleInit(): Promise<void> {
    if (!this.cfg.natsUrl) {
      this.log.warn('HR_NATS_URL blank — HR lifecycle consumer disabled');
      return;
    }
    try {
      this.nc = await connect({ servers: this.cfg.natsUrl, name: 'ktayl-iam-lifecycle' });
      const jsm = await this.nc.jetstreamManager();
      // ensure a durable, explicit-ack pull consumer bound to the stream (idempotent)
      await jsm.consumers.add(this.cfg.natsStream, {
        durable_name: HrLifecycleConsumer.DURABLE,
        ack_policy: 'explicit' as any,
        filter_subject: this.cfg.natsSubject,
        max_deliver: 5,
      }).catch((e: Error) => {
        if (!/already in use|exists/i.test(e.message)) throw e;
      });
      void this.loop(); // fire-and-forget consume loop
      this.log.log(`HR lifecycle consumer bound to ${this.cfg.natsStream} (${this.cfg.natsSubject})`);
    } catch (e) {
      this.log.error(`failed to start HR lifecycle consumer: ${(e as Error).message}`);
    }
  }

  private async loop(): Promise<void> {
    const js = this.nc!.jetstream();
    const consumer = await js.consumers.get(this.cfg.natsStream, HrLifecycleConsumer.DURABLE);
    const messages = await consumer.consume();
    for await (const m of messages) {
      if (this.stop) break;
      await this.onMessage(m);
    }
  }

  private async onMessage(m: JsMsg): Promise<void> {
    const raw = new TextDecoder().decode(m.data);
    try {
      const sig = m.headers?.get('HR-Signature') ?? '';
      if (!verifyRawSignature(raw, sig, this.cfg.signingKey)) {
        this.log.warn(`HR-Signature mismatch on ${m.subject} — refusing (term)`);
        m.term(); // forged/misconfigured — do not redeliver
        return;
      }
      const ev = JSON.parse(raw) as LifecycleEvent;
      await this.svc.handle(ev);
      m.ack();
    } catch (e) {
      this.log.error(`lifecycle message failed (will redeliver): ${(e as Error).message}`);
      m.nak(5000); // transient — redeliver after 5s (up to max_deliver)
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stop = true;
    await this.nc?.drain().catch(() => undefined);
  }
}
