import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { AuthentikClient } from '../directory/authentik.client.js';
import { AuditService } from '../catalog/audit.service.js';
import { ServiceAccountService } from './service-account.service.js';
import { VaultSecretStore } from './secret-store.js';
import type { ServiceAccount } from './entities/service-account.entity.js';

/**
 * Provisions an APPROVED service account to Authentik + Vault (IGA-06/S023). Runs after the
 * dual-approval clears (S022) — best-effort from the workflow, and re-triggerable via
 * `POST /service-accounts/:id/provision` if it failed. Steps:
 *   1. ensure the Authentik `service_account` user exists,
 *   2. ensure + add it to each requested `GROUP_<x>` (the authority it carries),
 *   3. mint an app-password token and write it to Vault (config-gated),
 *   4. flip the row to `active` with `authentikUsername` + `vaultSecretRef`, audited.
 *
 * The secret VALUE never touches the DB or the audit log — only the Vault ref is stored. Idempotent:
 * an already-`active` account is a no-op. A failure leaves the account NOT active (retryable) and is
 * audited as `service_account.provision_failed`; it does NOT un-approve the governance decision.
 */
@Injectable()
export class ServiceAccountProvisioningService {
  private readonly log = new Logger(ServiceAccountProvisioningService.name);

  constructor(
    private readonly accounts: ServiceAccountService,
    private readonly authentik: AuthentikClient,
    private readonly vault: VaultSecretStore,
    private readonly audit: AuditService,
  ) {}

  async provision(accountId: string, actor: string): Promise<ServiceAccount> {
    const account = await this.accounts.getById(accountId); // 404 if missing
    if (account.status === 'active') {
      this.log.log(`service account "${account.name}" already active — provisioning is a no-op`);
      return account;
    }
    if (account.status === 'disabled') {
      throw new ConflictException(
        `service account "${account.name}" is disabled and cannot be provisioned`,
      );
    }
    if (!this.authentik.canProvision) {
      throw new ConflictException('Authentik is not configured — cannot provision a service account');
    }

    try {
      await this.authentik.ensureServiceAccount(account.name, account.displayName);
      for (const group of account.groupRefs) {
        await this.authentik.ensureGroup(group);
        await this.authentik.addUserToGroup(account.name, group);
      }
      const key = await this.authentik.mintAppPassword(account.name, `sa-${account.name}`);
      const stored = await this.vault.store(account.name, { token: key, username: account.name });

      const updated = await this.accounts.markProvisioned(account.id, account.name, stored.ref);
      await this.audit.record({ actor: actor, action: 'service_account.provisioned', entityType: 'service_account', entityId: account.id, detail: {
        serviceAccount: account.name,
        authentikUsername: account.name,
        groups: account.groupRefs,
        vaultSecretRef: stored.ref,
        secretWritten: stored.written,
      } });
      this.log.log(
        `provisioned service account "${account.name}" → groups [${account.groupRefs.join(', ')}], ref ${stored.ref}`,
      );
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.audit.record({ actor: actor, action: 'service_account.provision_failed', entityType: 'service_account', entityId: account.id, detail: {
        serviceAccount: account.name,
        error: message,
      } });
      this.log.error(`provisioning "${account.name}" failed: ${message}`);
      throw err;
    }
  }
}
