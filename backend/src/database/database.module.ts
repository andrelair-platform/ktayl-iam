import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration.js';
import { MIGRATIONS } from './migrations/index.js';

/**
 * PostgreSQL connection (TypeORM). Entities are auto-loaded as feature modules register them.
 * `synchronize` is OFF (safe for a system of record); the schema is owned by migrations, which
 * run on boot (`migrationsRun`). Migrations are referenced as CLASSES (not a filesystem glob)
 * so they resolve cleanly under ESM/nodenext.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get<AppConfig['database']>('database')!;
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          autoLoadEntities: true,
          synchronize: false,
          migrations: MIGRATIONS,
          migrationsRun: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
