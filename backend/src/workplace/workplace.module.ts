import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Identity } from '../lifecycle/entities/identity.entity.js';
import { ExternalCollaborator } from '../external-collaborators/entities/external-collaborator.entity.js';
import { StalwartClient } from '../lifecycle/stalwart.client.js';
import { DirectoryModule } from '../directory/directory.module.js';
import { WorkplaceAccessService } from './workplace-access.service.js';

/**
 * The shared **workplace tier** (ADR-015): the company mailbox + birthright `Workplace Users` group that both
 * the HR Joiner (employees) and external-collaborator provisioning grant identically. Owns the cross-table email
 * namespace so the two populations never collide. Imported by LifecycleModule + ExternalCollaboratorsModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Identity, ExternalCollaborator]), DirectoryModule],
  providers: [WorkplaceAccessService, StalwartClient],
  exports: [WorkplaceAccessService],
})
export class WorkplaceModule {}
