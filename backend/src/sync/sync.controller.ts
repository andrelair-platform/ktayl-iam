import { Controller, Get, Post } from '@nestjs/common';
import { SyncService } from './sync.service.js';

/**
 * Admin control for the Authentik sync engine (S005): inspect the last reconcile and trigger one
 * on demand (the scheduled run is hourly). Admin-only via the global AuthenticatedGuard.
 */
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('status')
  status() {
    return { lastReconcile: this.sync.lastReport() };
  }

  @Post('reconcile')
  reconcile() {
    return this.sync.reconcile();
  }
}
