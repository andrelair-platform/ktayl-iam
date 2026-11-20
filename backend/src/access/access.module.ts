import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { Application } from '../catalog/entities/application.entity.js';
import { AuditLog } from '../catalog/entities/audit-log.entity.js';
import { AccessService } from './access.service.js';
import { AccessController } from './access.controller.js';
import { DirectoryModule } from '../directory/directory.module.js';

/** The evidence layer (S006) — who-has-what views + audit export + the ADR-017 self-service "My Access".
 *  DirectoryModule provides the AuthentikClient (live group memberships for the complete-picture view). */
@Module({
  imports: [TypeOrmModule.forFeature([Assignment, Application, AuditLog]), DirectoryModule],
  controllers: [AccessController],
  providers: [AccessService],
})
export class AccessModule {}
