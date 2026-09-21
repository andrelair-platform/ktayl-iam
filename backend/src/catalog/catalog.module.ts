import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Application } from './entities/application.entity.js';
import { Role } from './entities/role.entity.js';
import { Assignment } from './entities/assignment.entity.js';
import { Request } from './entities/request.entity.js';
import { AuditLog } from './entities/audit-log.entity.js';
import { CatalogService } from './catalog.service.js';
import { AuditService } from './audit.service.js';
import { CatalogController } from './catalog.controller.js';

/**
 * The application/role catalog (S002) — source of truth for apps → roles → owners.
 * Registers all five governance entities (Assignment/Request are schema-only until S004/S006).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Application, Role, Assignment, Request, AuditLog])],
  controllers: [CatalogController],
  providers: [CatalogService, AuditService],
  exports: [CatalogService, AuditService],
})
export class CatalogModule {}
