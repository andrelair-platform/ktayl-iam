import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 12-factor #6 (stateless processes): back express-session with Postgres (connect-pg-simple) instead of
 * the default in-memory MemoryStore — so the IAM console can run >1 replica and survive a pod restart
 * without logging everyone out. The schema stays migration-owned (synchronize is OFF), so the session
 * table is created here rather than at runtime (`createTableIfMissing` stays false in main.ts). This is
 * the canonical connect-pg-simple table (table.sql), minus the deprecated `WITH (OIDS=FALSE)`.
 */
export class SessionStore1727000700000 implements MigrationInterface {
  name = 'SessionStore1727000700000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid"    varchar      NOT NULL,
        "sess"   json         NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_session_expire"`);
    await q.query(`DROP TABLE IF EXISTS "session"`);
  }
}
