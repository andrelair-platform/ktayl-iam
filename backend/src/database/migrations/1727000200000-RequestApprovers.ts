import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * S004: the dual-approval workflow freezes the two resolved approvers on each request
 * (manager leg from HR, owner leg from the role). Nullable for any pre-existing rows; new
 * requests always set both (with a backup reassignment when a leg would be the requester).
 */
export class RequestApprovers1727000200000 implements MigrationInterface {
  name = 'RequestApprovers1727000200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "request" ADD COLUMN IF NOT EXISTS "manager_approver" varchar(32)`);
    await q.query(`ALTER TABLE "request" ADD COLUMN IF NOT EXISTS "owner_approver" varchar(32)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "request" DROP COLUMN IF EXISTS "owner_approver"`);
    await q.query(`ALTER TABLE "request" DROP COLUMN IF EXISTS "manager_approver"`);
  }
}
