import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceAccount } from './entities/service-account.entity.js';
import { ServiceAccountRequest } from './entities/service-account-request.entity.js';
import { ServiceAccountService } from './service-account.service.js';
import { ServiceAccountWorkflowService } from './service-account-workflow.service.js';
import { ServiceAccountProvisioningService } from './service-account-provisioning.service.js';
import { VaultSecretStore } from './secret-store.js';
import { ServiceAccountsController } from './service-accounts.controller.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { DirectoryModule } from '../directory/directory.module.js';

/**
 * Governed service/technical-account module (IGA-06). S021 = the entity + persistence; S022 = the
 * dual-approval request workflow (reusing the human four-eyes resolver) + the API; S023 = the
 * Authentik + Vault provisioning (on approval). Imports CatalogModule for the shared append-only
 * AuditService and DirectoryModule for the AuthentikClient.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceAccount, ServiceAccountRequest]),
    CatalogModule,
    DirectoryModule,
  ],
  controllers: [ServiceAccountsController],
  providers: [
    ServiceAccountService,
    ServiceAccountWorkflowService,
    ServiceAccountProvisioningService,
    VaultSecretStore,
  ],
  exports: [ServiceAccountService, ServiceAccountWorkflowService, ServiceAccountProvisioningService],
})
export class ServiceAccountsModule {}
