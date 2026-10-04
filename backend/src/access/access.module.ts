import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { Application } from '../catalog/entities/application.entity.js';
import { AuditLog } from '../catalog/entities/audit-log.entity.js';
import { AccessService } from './access.service.js';
import { AccessController } from './access.controller.js';

/** The evidence layer (S006) — who-has-what views + audit export. Read-only over the governance tables. */
@Module({
  imports: [TypeOrmModule.forFeature([Assignment, Application, AuditLog])],
  controllers: [AccessController],
  providers: [AccessService],
})
export class AccessModule {}
