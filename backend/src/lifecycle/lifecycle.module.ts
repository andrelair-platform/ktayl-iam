import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DirectoryModule } from '../directory/directory.module.js';
import { Assignment } from '../catalog/entities/assignment.entity.js';
import { Identity } from './entities/identity.entity.js';
import { LifecycleService } from './lifecycle.service.js';
import { StalwartClient } from './stalwart.client.js';
import { HrLifecycleConsumer } from './nats.consumer.js';

/**
 * S015/S016 — HR Joiner/Mover/Leaver intake + workspace provisioning. A durable NATS consumer of the
 * signed HR_LIFECYCLE stream drives the LifecycleService (mailbox + Authentik user + birthright group
 * + identity record). Reuses the AuthentikClient from DirectoryModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Identity, Assignment]), DirectoryModule],
  providers: [LifecycleService, StalwartClient, HrLifecycleConsumer],
  exports: [LifecycleService],
})
export class LifecycleModule {}
