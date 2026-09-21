import { InitCatalog1727000000000 } from './1727000000000-InitCatalog.js';
import { SeedCatalogApps1727000100000 } from './1727000100000-SeedCatalogApps.js';

/** Ordered migration set (run on boot via TypeORM `migrationsRun`). Append new migrations here. */
export const MIGRATIONS = [InitCatalog1727000000000, SeedCatalogApps1727000100000];
