import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { parseSuperAdminUserIds } from '@/lib/admin/super-admin-shared';

/**
 * Helm Bridge Layer 2 — THE shared server gate.
 *
 * requireSuperAdmin() must be the FIRST LINE of:
 *   - src/app/admin/layout.tsx
 *   - every page.tsx under src/app/admin
 *   - every export in src/app/admin/actions/*
 *   - every /api/admin-center route handler
 * Only after it resolves may code touch createAdminClient() or the
 * SENTRY_READ_TOKEN / VERCEL_API_TOKEN modules.
 *
 * checkSuperAdminAccess() is the NON-THROWING probe for polling clients —
 * preserves the checkAdminAccess() pattern (admin-data.ts:95-120) that ended
 * the 576-errors/day flood: a downgraded session stops polling cleanly
 * instead of 500ing every 5 minutes.
 */

export interface SuperAdminContext {
  userId: string;
  email: string;
}

export type SuperAdminProbe =
  | { allowed: true; context: SuperAdminContext }
  | { allowed: false; reason: 'unauthenticated' | 'forbidden' };

export async function checkSuperAdminAccess(): Promise<SuperAdminProbe> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, reason: 'unauthenticated' };

  const allow = parseSuperAdminUserIds(process.env.SUPER_ADMIN_USER_IDS);
  if (!allow.has(user.id)) return { allowed: false, reason: 'forbidden' };

  return { allowed: true, context: { userId: user.id, email: user.email ?? '' } };
}

export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const probe = await checkSuperAdminAccess();
  if (!probe.allowed) {
    throw new Error(probe.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden');
  }
  return probe.context;
}
