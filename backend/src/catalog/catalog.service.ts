import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application } from './entities/application.entity.js';
import { Role } from './entities/role.entity.js';
import { AuditService } from './audit.service.js';
import { CreateApplicationDto } from './dto/create-application.dto.js';
import { CreateRoleDto } from './dto/create-role.dto.js';

/**
 * The application/role catalog — the SOURCE OF TRUTH for what apps exist, what roles they
 * have, and who owns each role. Enforces the S002 invariants (unique names, owner required)
 * and writes an audit row on every mutation.
 */
@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Application)
    private readonly apps: Repository<Application>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    private readonly audit: AuditService,
  ) {}

  listApplications(): Promise<Application[]> {
    return this.apps.find({ relations: { roles: true }, order: { name: 'ASC' } });
  }

  async getApplication(id: string): Promise<Application> {
    const app = await this.apps.findOne({ where: { id }, relations: { roles: true } });
    if (!app) throw new NotFoundException(`application ${id} not found`);
    return app;
  }

  async createApplication(dto: CreateApplicationDto, actor: string): Promise<Application> {
    if (await this.apps.exists({ where: { name: dto.name } })) {
      throw new ConflictException(`an application named "${dto.name}" already exists`);
    }
    const app = await this.apps.save(
      this.apps.create({
        name: dto.name,
        tier: dto.tier,
        authentikAppRef: dto.authentikAppRef,
        description: dto.description ?? null,
      }),
    );
    await this.audit.record(actor, 'application.created', 'application', app.id, {
      name: app.name,
      tier: app.tier,
    });
    return app;
  }

  async addRole(applicationId: string, dto: CreateRoleDto, actor: string): Promise<Role> {
    const app = await this.getApplication(applicationId);
    // AC-4 (defence-in-depth beyond the DTO + NOT NULL column): never a role without an owner.
    if (!dto.owner?.trim()) {
      throw new BadRequestException('a role must have an owner (the second approver) before it can be requested');
    }
    if (await this.roles.exists({ where: { applicationId: app.id, name: dto.name } })) {
      throw new ConflictException(`application "${app.name}" already has a role named "${dto.name}"`);
    }
    const role = await this.roles.save(
      this.roles.create({
        applicationId: app.id,
        name: dto.name,
        owner: dto.owner.trim(),
        authentikGroupRef: dto.authentikGroupRef,
        description: dto.description ?? null,
      }),
    );
    await this.audit.record(actor, 'role.created', 'role', role.id, {
      application: app.name,
      role: role.name,
      owner: role.owner,
      authentikGroupRef: role.authentikGroupRef,
    });
    return role;
  }

  listRoles(applicationId: string): Promise<Role[]> {
    return this.roles.find({ where: { applicationId }, order: { name: 'ASC' } });
  }
}
