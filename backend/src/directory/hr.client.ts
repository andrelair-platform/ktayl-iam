import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';

/**
 * ERPNext HR adapter (AC-2) — the manager source of truth. Resolves a person's manager by
 * reading the Employee `reports_to` chain, keyed on `employee_number` = matricule. Read-only.
 * If ERPNext isn't configured/reachable or the chain can't be resolved it returns `null`, and
 * the resolver falls back (AC-4) — HR is never bypassed by trusting caller-supplied data (AC-3).
 */
@Injectable()
export class HrClient {
  private readonly log = new Logger(HrClient.name);
  private readonly base: string;
  private readonly authHeader: string | null;

  constructor(config: ConfigService) {
    const d = config.get<AppConfig['directory']>('directory')!;
    this.base = d.erpnextUrl.replace(/\/$/, '');
    this.authHeader = d.erpnextApiKey && d.erpnextApiSecret ? `token ${d.erpnextApiKey}:${d.erpnextApiSecret}` : null;
  }

  get configured(): boolean {
    return Boolean(this.base && this.authHeader);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Authorization: this.authHeader!, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`ERPNext GET ${path} → ${res.status}`);
    return res.json() as Promise<T>;
  }

  /**
   * Resolve the matricule of `matricule`'s manager from HR, or `null` if HR is unavailable or
   * the person / their manager / a manager matricule can't be found.
   */
  async getManagerMatricule(matricule: string): Promise<string | null> {
    if (!this.configured) return null;
    try {
      const emp = await this.get<{ data: { name: string; reports_to: string | null }[] }>(
        `/api/resource/Employee?filters=${encodeURIComponent(JSON.stringify([['employee_number', '=', matricule]]))}&fields=${encodeURIComponent(JSON.stringify(['name', 'reports_to', 'employee_number']))}`,
      );
      const reportsTo = emp.data?.[0]?.reports_to;
      if (!reportsTo) return null;
      const mgr = await this.get<{ data: { employee_number: string | null } }>(
        `/api/resource/Employee/${encodeURIComponent(reportsTo)}?fields=${encodeURIComponent(JSON.stringify(['employee_number']))}`,
      );
      return mgr.data?.employee_number || null;
    } catch (e) {
      this.log.warn(`HR manager lookup failed for ${matricule}: ${(e as Error).message}`);
      return null;
    }
  }
}
