import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceAccount } from './entities/service-account.entity.js';
import { ServiceAccountService } from './service-account.service.js';
import { CatalogModule } from '../catalog/catalog.module.js';

/**
 * Governed service/technical-account module (IGA-06). S021 registers the entity + persistence service;
 * the request/approval (S022) and Authentik/Vault provisioning (S023) build on it. Imports CatalogModule
 * for the shared append-only AuditService.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ServiceAccount]), CatalogModule],
  providers: [ServiceAccountService],
  exports: [ServiceAccountService],
})
export class ServiceAccountsModule {}
