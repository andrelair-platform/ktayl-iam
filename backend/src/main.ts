import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
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
