import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalCollaborator } from './entities/external-collaborator.entity.js';
import { ExternalCollaboratorService } from './external-collaborator.service.js';
import { CatalogModule } from '../catalog/catalog.module.js';

/**
 * Governed external-collaborator module (IGA-07). S025 = the entity + persistence; S026 adds the
 * sponsor+Security dual-approval request + API; S027 the Authentik provisioning; S028 expiry/renewal;
 * S029 the sponsor-Leaver safety net. Imports CatalogModule for the shared append-only AuditService.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ExternalCollaborator]), CatalogModule],
  providers: [ExternalCollaboratorService],
  exports: [ExternalCollaboratorService],
})
export class ExternalCollaboratorsModule {}
