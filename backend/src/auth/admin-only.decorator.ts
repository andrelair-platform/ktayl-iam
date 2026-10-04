import { SetMetadata } from '@nestjs/common';

export const ADMIN_ONLY_KEY = 'isAdminOnly';

/**
 * Marks a route (or whole controller) as **admin-only** (S009). The global `AdminGuard` then requires
 * the signed-in user to be in the admin group (`AuthUser.isAdmin`). Un-decorated routes are open to any
 * authenticated user (requester/approver) — the `AuthenticatedGuard` still guarantees a session.
 */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);
