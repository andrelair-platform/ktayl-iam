import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceAccount } from './entities/service-account.entity.js';
import { ServiceAccountRequest } from './entities/service-account-request.entity.js';
import { ServiceAccountService } from './service-account.service.js';
import { ServiceAccountWorkflowService } from './service-account-workflow.service.js';
import { ServiceAccountsController } from './service-accounts.controller.js';
import { CatalogModule } from '../catalog/catalog.module.js';

/**
 * Governed service/technical-account module (IGA-06). S021 = the entity + persistence; S022 = the
 * dual-approval request workflow (reusing the human four-eyes resolver) + the API. S023 adds the
 * Authentik + Vault provisioning. Imports CatalogModule for the shared append-only AuditService.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ServiceAccount, ServiceAccountRequest]), CatalogModule],
  controllers: [ServiceAccountsController],
  providers: [ServiceAccountService, ServiceAccountWorkflowService],
  exports: [ServiceAccountService, ServiceAccountWorkflowService],
})
export class ServiceAccountsModule {}
