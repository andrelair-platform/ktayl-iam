import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../catalog/entities/role.entity.js';
import { Request } from '../catalog/entities/request.entity.js';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { WorkflowService } from './workflow.service.js';
import { RequestsController } from './requests.controller.js';

/**
 * The dual-approval workflow (S004, the core control). Consumes the manager resolver
 * (DirectoryModule), the audit log (CatalogModule) and the Authentik sync engine (SyncModule) so a
 * both-approved request provisions real access.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Request, Assignment, Role]),
    CatalogModule,
    DirectoryModule,
    SyncModule,
  ],
  controllers: [RequestsController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
