import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthenticatedGuard } from './authenticated.guard.js';
import { AdminGuard } from './admin.guard.js';
import { OidcStrategy } from './oidc.strategy.js';
import { SessionSerializer } from './session.serializer.js';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ session: true, defaultStrategy: 'openidconnect' }),
  ],
  controllers: [AuthController],
  providers: [
    OidcStrategy,
    SessionSerializer,
    // Guards run in registration order: (1) every route is session-protected by default (@Public()
    // opts out), then (2) @AdminOnly() routes additionally require AuthUser.isAdmin (S009).
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
    { provide: APP_GUARD, useClass: AdminGuard },
  ],
})
export class AuthModule {}
