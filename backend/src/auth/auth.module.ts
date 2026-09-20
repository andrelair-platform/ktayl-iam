import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthenticatedGuard } from './authenticated.guard.js';
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
    // Every route is session-protected by default; @Public() opts out.
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
  ],
})
export class AuthModule {}
