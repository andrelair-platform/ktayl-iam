import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CatalogService } from './catalog.service.js';
import { CreateApplicationDto } from './dto/create-application.dto.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import type { AuthUser } from '../auth/oidc.strategy.js';

/** matricule of the signed-in admin (the global AuthenticatedGuard guarantees a session). */
function actorOf(req: Request): string {
  return (req.user as AuthUser | undefined)?.username ?? 'unknown';
}

/**
 * Admin API for the application/role catalog (S002). Admin-only via the global
 * AuthenticatedGuard — these are Access Governance console routes.
 */
@Controller('applications')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listApplications() {
    return this.catalog.listApplications();
  }

  @Post()
  createApplication(@Body() dto: CreateApplicationDto, @Req() req: Request) {
    return this.catalog.createApplication(dto, actorOf(req));
  }

  @Get(':id')
  getApplication(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getApplication(id);
  }

  @Get(':id/roles')
  listRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.listRoles(id);
  }

  @Post(':id/roles')
  addRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRoleDto,
    @Req() req: Request,
  ) {
    return this.catalog.addRole(id, dto, actorOf(req));
  }
}
