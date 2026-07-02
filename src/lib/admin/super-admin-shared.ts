/**
 * Helm Bridge — edge-safe super-admin helpers.
 *
 * Imported by BOTH src/lib/supabase/middleware.ts (edge runtime) and the
 * node server helper. MUST stay pure: no 'server-only', no supabase, no
 * node built-ins. The allowlist env var SUPER_ADMIN_USER_IDS is server-only
 * (never NEXT_PUBLIC_) and read by callers, not here.
 */

export function parseSuperAdminUserIds(
  raw: string | undefined | null,
): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export type AdminGateDecision =
  | 'not-admin-path'
  | 'block-native'
  | 'redirect-login'
  | 'redirect-dashboard'
  | 'pass';

/**
 * Pure decision core for the middleware layer. Order matters:
 * native block (App Store 4.2.2/3.1.1) → auth → allowlist. Fails CLOSED
 * (redirect-dashboard) when the allowlist env is missing.
 */
export function evaluateAdminGate(input: {
  pathname: string;
  isNative: boolean;
  userId: string | null;
  allowlistRaw: string | undefined;
}): AdminGateDecision {
  if (!isAdminPath(input.pathname)) return 'not-admin-path';
  if (input.isNative) return 'block-native';
  if (!input.userId) return 'redirect-login';
  const allow = parseSuperAdminUserIds(input.allowlistRaw);
  if (!allow.has(input.userId)) return 'redirect-dashboard';
  return 'pass';
}
