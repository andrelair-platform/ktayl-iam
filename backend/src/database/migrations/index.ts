import { InitCatalog1727000000000 } from './1727000000000-InitCatalog.js';
import { SeedCatalogApps1727000100000 } from './1727000100000-SeedCatalogApps.js';
import { RequestApprovers1727000200000 } from './1727000200000-RequestApprovers.js';
import { AssignmentSync1727000300000 } from './1727000300000-AssignmentSync.js';
import { AuditAppendOnly1727000400000 } from './1727000400000-AuditAppendOnly.js';
import { IdentityLifecycle1727000500000 } from './1727000500000-IdentityLifecycle.js';
import { LeaverColumns1727000600000 } from './1727000600000-LeaverColumns.js';
import { SessionStore1727000700000 } from './1727000700000-SessionStore.js';
import { SeedPlatformToolsCatalog1727000800000 } from './1727000800000-SeedPlatformToolsCatalog.js';
import { SeedKtaylCoreRoles1727000900000 } from './1727000900000-SeedKtaylCoreRoles.js';
import { ServiceAccounts1727001000000 } from './1727001000000-ServiceAccounts.js';
import { ServiceAccountRequests1727001100000 } from './1727001100000-ServiceAccountRequests.js';
import { ExternalCollaborators1727001200000 } from './1727001200000-ExternalCollaborators.js';
import { ExternalCollaboratorRequests1727001300000 } from './1727001300000-ExternalCollaboratorRequests.js';

/** Ordered migration set (run on boot via TypeORM `migrationsRun`). Append new migrations here. */
export const MIGRATIONS = [
  InitCatalog1727000000000,
  SeedCatalogApps1727000100000,
  RequestApprovers1727000200000, // S004 — request approver legs
  AssignmentSync1727000300000, // S005 — assignment sync state
  AuditAppendOnly1727000400000, // S006 — append-only audit rules
  IdentityLifecycle1727000500000, // S015/S016 — HR Joiner identity table
  LeaverColumns1727000600000, // S017 — leaver scheduled-revocation columns
  SessionStore1727000700000, // 12-factor #6 — Postgres-backed express-session (not in-memory)
  SeedPlatformToolsCatalog1727000800000, // engineering tools catalog (Kargo/Vault/Backstage + SSO-gated) — SoR for the platform-access-matrix
  SeedKtaylCoreRoles1727000900000, // ktayl-core (Insurance LOB) app + functional roles (Underwriting/Compliance/Finance/Complaints)
  ServiceAccounts1727001000000, // IGA-06/S021 — governed service/technical-account table
  ServiceAccountRequests1727001100000, // IGA-06/S022 — service-account request + dual-approval
  ExternalCollaborators1727001200000, // IGA-07/S025 — governed external-collaborator table
  ExternalCollaboratorRequests1727001300000, // IGA-07/S026 — external-collaborator request + Sponsor+Security four-eyes
];
