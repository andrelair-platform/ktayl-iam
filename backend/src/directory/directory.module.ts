import { Module } from '@nestjs/common';
import { AuthentikClient } from './authentik.client.js';
import { HrClient } from './hr.client.js';
import { ManagerResolverService } from './manager-resolver.service.js';
import { DirectoryController } from './directory.controller.js';

/**
 * Directory + manager resolution (S003) — the two inputs for the dual-approval workflow:
 * the Authentik directory (users/groups, read-only) and ERPNext HR (manager, with fallback).
 * Exports the resolver + clients so S004's workflow can consume them.
 */
@Module({
  controllers: [DirectoryController],
  providers: [AuthentikClient, HrClient, ManagerResolverService],
  exports: [AuthentikClient, HrClient, ManagerResolverService],
})
export class DirectoryModule {}
