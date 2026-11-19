import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalCollaborator } from './entities/external-collaborator.entity.js';
import { ExternalCollaboratorRequest } from './entities/external-collaborator-request.entity.js';
import { ExternalCollaboratorService } from './external-collaborator.service.js';
import { ExternalCollaboratorWorkflowService } from './external-collaborator-workflow.service.js';
import { ExternalCollaboratorProvisioningService } from './external-collaborator-provisioning.service.js';
import { ExternalCollaboratorSentinelService } from './external-collaborator-sentinel.service.js';
import { ExternalCollaboratorsController } from './external-collaborators.controller.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { DirectoryModule } from '../directory/directory.module.js';

/**
 * Governed external-collaborator module (IGA-07). S025 = the entity + persistence; S026 = the
 * Sponsor+Security dual-approval request workflow (+ active-sponsor validation + expiry ceiling) + API;
 * S027 the Authentik provisioning; S028 expiry/renewal; S029 the sponsor-Leaver safety net. Imports
 * CatalogModule for the shared AuditService and DirectoryModule for the AuthentikClient (sponsor check).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalCollaborator, ExternalCollaboratorRequest]),
    CatalogModule,
    DirectoryModule,
  ],
  controllers: [ExternalCollaboratorsController],
  providers: [
    ExternalCollaboratorService,
    ExternalCollaboratorWorkflowService,
    ExternalCollaboratorProvisioningService,
    ExternalCollaboratorSentinelService,
  ],
  exports: [
    ExternalCollaboratorService,
    ExternalCollaboratorWorkflowService,
    ExternalCollaboratorProvisioningService,
  ],
})
export class ExternalCollaboratorsModule {}
