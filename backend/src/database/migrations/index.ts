import { InitCatalog1727000000000 } from './1727000000000-InitCatalog.js';
import { SeedCatalogApps1727000100000 } from './1727000100000-SeedCatalogApps.js';
import { RequestApprovers1727000200000 } from './1727000200000-RequestApprovers.js';
import { AssignmentSync1727000300000 } from './1727000300000-AssignmentSync.js';
import { AuditAppendOnly1727000400000 } from './1727000400000-AuditAppendOnly.js';
import { IdentityLifecycle1727000500000 } from './1727000500000-IdentityLifecycle.js';
import { LeaverColumns1727000600000 } from './1727000600000-LeaverColumns.js';

/** Ordered migration set (run on boot via TypeORM `migrationsRun`). Append new migrations here. */
export const MIGRATIONS = [
  InitCatalog1727000000000,
  SeedCatalogApps1727000100000,
  RequestApprovers1727000200000, // S004 — request approver legs
  AssignmentSync1727000300000, // S005 — assignment sync state
  AuditAppendOnly1727000400000, // S006 — append-only audit rules
  IdentityLifecycle1727000500000, // S015/S016 — HR Joiner identity table
  LeaverColumns1727000600000, // S017 — leaver scheduled-revocation columns
];
