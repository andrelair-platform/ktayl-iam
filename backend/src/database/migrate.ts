/**
 * Standalone TypeORM migration runner — runs the ordered MIGRATIONS against the database described by
 * the DATABASE_* env vars, WITHOUT booting the Nest app (no HTTP / NATS / OIDC / scheduled jobs). The
 * app runs these same migrations on boot (`migrationsRun: true`, see database.module.ts); this is the
 * CLI equivalent for two uses:
 *   - `npm run db:migrate` — apply pending migrations against a target DB.
 *   - the CI `schema-erd-drift` job — materialise the schema in an ephemeral Postgres so tbls can
 *     reverse-engineer the committed ERD (docs/data-model) and fail on drift.
 * synchronize stays OFF — the migrations own the schema. No entities are needed to run them (each
 * migration is raw DDL via QueryRunner), so this DataSource deliberately omits `entities`.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MIGRATIONS } from './migrations/index.js';

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'ktayl_iam',
  migrations: MIGRATIONS,
});

try {
  await ds.initialize();
  const applied = await ds.runMigrations();
  console.log(`applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ') || '(none pending)'}`);
  await ds.destroy();
} catch (err) {
  console.error('migration failed:', err);
  process.exit(1);
}
