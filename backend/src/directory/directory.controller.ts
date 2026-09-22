import { Controller, Get, Param } from '@nestjs/common';
import { AuthentikClient } from './authentik.client.js';
import { HrClient } from './hr.client.js';
import { ManagerResolverService } from './manager-resolver.service.js';

/**
 * Directory + manager-resolution API (S003). Admin-only via the global session guard.
 * The two inputs the approval workflow needs: who exists (Authentik) and who each person's
 * manager is (ERPNext HR, with a flagged fallback).
 */
@Controller('directory')
export class DirectoryController {
  constructor(
    private readonly authentik: AuthentikClient,
    private readonly hr: HrClient,
    private readonly resolver: ManagerResolverService,
  ) {}

  /** Which upstreams are wired (ops visibility; the workflow degrades to fallback if HR is off). */
  @Get('status')
  status() {
    return { authentik: this.authentik.configured, hr: this.hr.configured };
  }

  @Get('users')
  users() {
    return this.authentik.listUsers();
  }

  @Get('groups')
  groups() {
    return this.authentik.listGroups();
  }

  /** Resolve approver #1 for a matricule (AC-2/3/4) — manager from HR, else flagged fallback. */
  @Get('manager/:matricule')
  manager(@Param('matricule') matricule: string) {
    return this.resolver.resolveManager(matricule);
  }
}
