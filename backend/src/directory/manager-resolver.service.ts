import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { HrClient } from './hr.client.js';

export interface ManagerResolution {
  requester: string;
  /** The resolved first approver's matricule (either the HR manager or the fallback). */
  manager: string;
  source: 'hr' | 'fallback';
  /** True when HR could not resolve a manager → routed to the flagged fallback approver (AC-4). */
  fallback: boolean;
  reason?: string;
}

/**
 * Resolves approver #1 (the requester's manager) for the dual-approval workflow.
 * - **AC-3:** the manager is derived ONLY from HR (`HrClient`) keyed on the requester's matricule;
 *   it is never accepted from a request payload — this method takes just the matricule, by design.
 * - **AC-4:** when HR can't resolve a manager (no employee, no `reports_to`, HR down, or the manager
 *   would be the requester themselves) the request is routed to a **flagged fallback approver**, so
 *   nobody silently self-serves.
 */
@Injectable()
export class ManagerResolverService {
  private readonly fallbackApprover: string;

  constructor(
    private readonly hr: HrClient,
    config: ConfigService,
  ) {
    this.fallbackApprover = config.get<AppConfig['directory']>('directory')!.fallbackApprover;
  }

  async resolveManager(matricule: string): Promise<ManagerResolution> {
    const manager = await this.hr.getManagerMatricule(matricule);

    if (manager && manager !== matricule) {
      return { requester: matricule, manager, source: 'hr', fallback: false };
    }

    const reason = !this.hr.configured
      ? 'HR (ERPNext) not configured — using fallback approver'
      : manager === matricule
        ? 'HR manager resolves to the requester — using fallback approver'
        : 'no manager found in HR for this matricule — using fallback approver';

    return {
      requester: matricule,
      manager: this.fallbackApprover,
      source: 'fallback',
      fallback: true,
      reason,
    };
  }
}
