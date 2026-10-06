import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import passport from 'passport';
import helmet from 'helmet';
import type { AppConfig } from './config/configuration.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Behind ingress-nginx (TLS terminated there, HTTP to the pod). Trust the proxy's
  // X-Forwarded-Proto so req.secure=true → express-session actually SETS the `secure`
  // session cookie. Without this the cookie is dropped → OIDC `state` isn't stored →
  // passport fails on callback → 401 before validate() ever runs.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.setGlobalPrefix('api');
  // Strip unknown props, reject extras, and coerce DTO types across all endpoints.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.use(helmet());
  app.enableCors({
    origin: config.get<string>('frontendUrl'),
    credentials: true,
  });

  // 12-factor #6 — sessions live in Postgres (the IAM app's own DB, an attached backing service),
  // NOT the default in-memory MemoryStore. That lets the console run >1 replica and survive a pod
  // restart without logging everyone out. The `session` table is migration-owned (SessionStore
  // migration), so createTableIfMissing stays false — the app never does runtime DDL.
  const db = config.get<AppConfig['database']>('database')!;
  const PgSession = connectPgSimple(session);
  const sessionPool = new pg.Pool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.name,
  });
  app.use(
    session({
      store: new PgSession({ pool: sessionPool, tableName: 'session', createTableIfMissing: false }),
      secret: config.get<string>('sessionSecret')!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.get<string>('nodeEnv') === 'production',
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000, // 8h
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  await app.listen(config.get<number>('port') ?? 3000);
}
await bootstrap();
