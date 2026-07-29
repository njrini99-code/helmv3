import 'server-only';
import { cache } from 'react';
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
 *
 * ─── ONE SOURCE OF TRUTH ────────────────────────────────────────────────────
 *
 * This gate asks the DATABASE — `public.is_super_admin()`, through the
 * user-scoped client — rather than reading `SUPER_ADMIN_USER_IDS` itself.
 *
 * It used to read the env var, and that made Bridge's read gate and its write
 * gate two different authorities:
 *
 *   READ   requireSuperAdmin()      -> SUPER_ADMIN_USER_IDS (env)
 *   WRITE  resolve_admin_event()    -> is_super_admin() -> admin_allowlist (table)
 *
 * Nothing kept them in sync, and on 2026-07-29 they diverged in production: an
 * account present in the env var and absent from the table got full console
 * access and a Resolve button that raised `Forbidden` on every click. Measured:
 * 0 events resolved in 24h. The symptom — "if the errors are resolved it still
 * doesn't go away it just stays" — points at the list, the cache, the
 * revalidation, at anything except a privilege table, and it cost a long
 * investigation to find.
 *
 * The database side cannot be the one to move: Postgres cannot read the app's
 * environment, and `is_super_admin()` also gates RLS policies elsewhere in the
 * schema. So the app conforms to the database. Calling the same FUNCTION — not
 * merely reading the same table — means the two gates cannot drift by
 * construction, because there is no second copy of the rule to fall out of
 * date.
 *
 * ─── WHY THE ENV VAR STILL EXISTS ───────────────────────────────────────────
 *
 * Break-glass, and only that. If the RPC cannot be reached at all — the exact
 * situation earlier the same day, when Postgres served zero queries for 9.4
 * hours — then denying everyone would lock admins out of the console at the
 * precise moment they need it to diagnose the outage. So an UNREACHABLE
 * database falls back to the env var and marks the context `degraded`.
 *
 * The distinction that matters, and the one the old code could not make:
 *
 *   RPC answered `false`   -> DENY. The database has an opinion; it is no.
 *   RPC could not answer   -> fall back to the env var, and say so.
 *
 * A successful "no" is never overridden. That is the whole fix. The fallback
 * also still fails CLOSED when the env var is unset.
 *
 * `src/lib/supabase/middleware.ts` keeps its own cheap env-var check
 * (`evaluateAdminGate`). That is deliberate and is NOT a second authority: it
 * runs at the edge on every request, it only ever redirects, and adding a
 * database round-trip to middleware is what took the whole site down earlier
 * the same day. It is a routing hint. THIS function is the security boundary.
 */

export interface SuperAdminContext {
  userId: string;
  email: string;
  /** True only when the allowlist RPC was unreachable and the env-var
   *  break-glass path granted access. Surfaced so callers can say so, rather
   *  than presenting a degraded console as a healthy one. */
  degraded?: boolean;
}

export type SuperAdminProbe =
  | { allowed: true; context: SuperAdminContext }
  | { allowed: false; reason: 'unauthenticated' | 'forbidden' };

type AllowlistAnswer = { reachable: true; isSuperAdmin: boolean } | { reachable: false };

/**
 * `cache()` per request, so a layout + page + server-action pass shares one
 * round-trip instead of paying three. (~60 FILES call this gate, but a single
 * request only touches a handful of them — the earlier draft of this comment
 * conflated the two numbers.) Note the memoisation only applies inside a React
 * request scope; outside one, each call is its own RPC.
 */
const askDatabase = cache(async (): Promise<AllowlistAnswer> => {
  try {
    const supabase = await createClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: 'is_super_admin',
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    const { data, error } = await rpc('is_super_admin');
    if (error) return { reachable: false };
    return { reachable: true, isSuperAdmin: data === true };
  } catch {
    return { reachable: false };
  }
});

export async function checkSuperAdminAccess(): Promise<SuperAdminProbe> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, reason: 'unauthenticated' };

  const answer = await askDatabase();

  if (answer.reachable) {
    // The database has an opinion, and it is final in BOTH directions. A
    // `false` here is never overridden by the env var — that override is
    // exactly the bug this replaces.
    if (!answer.isSuperAdmin) return { allowed: false, reason: 'forbidden' };
    return { allowed: true, context: { userId: user.id, email: user.email ?? '' } };
  }

  const allow = parseSuperAdminUserIds(process.env.SUPER_ADMIN_USER_IDS);
  if (!allow.has(user.id)) return { allowed: false, reason: 'forbidden' };
  return { allowed: true, context: { userId: user.id, email: user.email ?? '', degraded: true } };
}

export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const probe = await checkSuperAdminAccess();
  if (!probe.allowed) {
    throw new Error(probe.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden');
  }
  return probe.context;
}
