import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
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

  app.use(
    session({
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
