import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { loadConfig, validateEnv } from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { DirectoryModule } from './directory/directory.module.js';
import { SyncModule } from './sync/sync.module.js';
import { WorkflowModule } from './workflow/workflow.module.js';
import { AccessModule } from './access/access.module.js';
import { LifecycleModule } from './lifecycle/lifecycle.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfig],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(), // drives the S005 hourly reconcile cron
    DatabaseModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    DirectoryModule,
    SyncModule, // S005 — Authentik sync engine
    WorkflowModule, // S004 — dual-approval workflow
    AccessModule, // S006 — who-has-what + audit
    LifecycleModule, // S015/S016 — HR Joiner intake + workspace provisioning
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
