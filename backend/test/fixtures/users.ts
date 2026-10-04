/**
 * Shared, SYNTHETIC test fixtures — never real people or real PII.
 * Matricules use the 9xxxxx test range; emails use the reserved `.test` TLD (RFC 6761).
 */
import type { AuthUser } from '../../src/auth/oidc.strategy.js';

export const ADMIN_GROUP = 'Platform Admins';

/** The standard OIDC userinfo profile passport-openidconnect builds — NO groups (by design). */
export const UI_PROFILE = {
  id: 'test-sub-admin',
  displayName: 'Test Admin',
  username: '900001',
  name: { familyName: 'Admin', givenName: 'Test' },
  emails: [{ value: 'test.admin@example.test' }],
};

/** A resolved admin session user (member of the admin group → isAdmin). */
export const ADMIN_USER: AuthUser = {
  id: 'test-sub-admin',
  username: '900001',
  email: 'test.admin@example.test',
  groups: [ADMIN_GROUP, 'Développeurs', 'QA'],
  isAdmin: true,
};

/** A resolved non-admin session user (S008: admitted, but isAdmin=false → @AdminOnly routes 403). */
export const NON_ADMIN_USER: AuthUser = {
  id: 'test-sub-user',
  username: '900002',
  email: 'test.user@example.test',
  groups: ['Développeurs', 'QA'],
  isAdmin: false,
};
