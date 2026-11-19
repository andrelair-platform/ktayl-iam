import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';

export interface StoredSecretRef {
  /** The mount-qualified KV path (e.g. `secret/platform/service-accounts/<name>`) an ESO ExternalSecret reads. */
  ref: string;
  /** True if the value was actually written; false → store not configured and `ref` is the PLANNED path. */
  written: boolean;
}

/**
 * Writes a minted service-account credential to Vault KV-v2 (IGA-06/S023). **Config-gated** — with no
 * `VAULT_ADDR`/`VAULT_TOKEN` it is `available = false` and {@link store} returns the planned ref
 * WITHOUT writing, so dev (no Vault write-token) still provisions the Authentik account; a consumer's
 * ESO ExternalSecret then points at the same path once the write-token is wired. The app NEVER
 * persists the secret value anywhere — only the ref lands on the `service_account` row + audit log.
 */
@Injectable()
export class VaultSecretStore {
  private readonly log = new Logger(VaultSecretStore.name);
  private readonly addr: string;
  private readonly token: string;
  private readonly mount: string;
  private readonly basePath: string;

  constructor(config: ConfigService) {
    const v = config.get<AppConfig['vault']>('vault')!;
    this.addr = v.addr.replace(/\/$/, '');
    this.token = v.token;
    this.mount = v.mount;
    this.basePath = v.basePath.replace(/^\/|\/$/g, '');
  }

  get available(): boolean {
    return Boolean(this.addr && this.token);
  }

  /** The mount-qualified KV path a consumer's ESO ExternalSecret reads (logical; no `/data/` infix). */
  refFor(name: string): string {
    return `${this.mount}/${this.basePath}/${name}`;
  }

  async store(name: string, data: Record<string, string>): Promise<StoredSecretRef> {
    const ref = this.refFor(name);
    if (!this.available) {
      this.log.warn(
        `Vault write not configured — "${name}" credential NOT persisted (planned ref: ${ref})`,
      );
      return { ref, written: false };
    }
    // KV-v2 write: the API path carries the `/data/` infix, the logical ref does not.
    const url = `${this.addr}/v1/${this.mount}/data/${this.basePath}/${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Vault-Token': this.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Vault write ${ref} → ${res.status} ${txt}`.trim());
    }
    this.log.log(`wrote service-account credential to Vault "${ref}"`);
    return { ref, written: true };
  }
}
