import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { Role } from '../catalog/entities/role.entity.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { SyncService } from './sync.service.js';
import { SyncController } from './sync.controller.js';

/**
 * The Authentik sync engine (S005) — provisions approved assignments as group memberships and runs
 * the scheduled reconcile. Consumes the AuthentikClient (DirectoryModule) + AuditService
 * (CatalogModule); exported so the dual-approval workflow (S004) can provision on both-approved.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Assignment, Role]), CatalogModule, DirectoryModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
