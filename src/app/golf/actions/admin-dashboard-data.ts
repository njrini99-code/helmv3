'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAdminRollupA, type RollupA } from './admin/rollup-a';
import { fetchAdminRollupB, type RollupB } from './admin/rollup-b';
import { fetchAdminRollupC } from './admin/rollup-c';
import { EMPTY_ROLLUP_C } from './admin/rollup-c.shared';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { fetchVercelWebInsights } from '@/lib/admin/vercel-api';
import type { AdminDashboardData, PlatformHealthStatsResult } from './admin-data-shared';
import { assembleAdminDashboardData } from './admin-dashboard-assemble';

// ============================================
// ADMIN DASHBOARD ROLLUP (single-call RPC)
// ============================================
//
// Auth + role check runs first via the user-scoped supabase-ssr client. The
// RPC itself ALSO enforces admin-only access (migration 00004) by checking
// `users WHERE id = auth.uid() AND role = 'admin'` — this only resolves when
// the call carries the admin's JWT, which is exactly what the user-scoped
// client provides.
//
// Previous implementation wrapped this in `unstable_cache` and used the
// service_role client inside the cache body (because unstable_cache forbids
// request-scoped state). After the perf fix landed and the function actually
// began executing instead of timing out, that path tripped the SECURITY
// DEFINER admin gate: service_role JWTs leave `auth.uid()` NULL, so the
// `users.id = auth.uid()` predicate matched zero rows and the function
// raised 'Forbidden' (code=42501) — 509 occurrences in ~1.5h. The RPC is
// cheap (<100ms post-perf-fix) and only runs once per admin page load, so we
// drop the cache and call directly via the user-scoped client.

/** Shape returned by `public.get_admin_dashboard_rollup()` (see migration
 *  20260421000001_admin_dashboard_rollup.sql). */
export interface AdminDashboardRollup {
  generated_at: string;
  users: {
    total: number;
    admins: number;
    coaches: number;
    players: number;
    new_last_7d: number;
    new_last_30d: number;
    active_1h: number;
    active_24h: number;
    active_7d: number;
    active_30d: number;
  };
  rounds: {
    total_rounds: number;
    rounds_last_7d: number;
    rounds_last_30d: number;
    active_players: number;
    players_active_30d: number;
    at_risk_players: number;
  };
  rounds_today: number;
  teams: {
    golf_teams: number;
    golf_teams_new_30d: number;
    golf_teams_active: number;
    baseball_teams: number;
  };
  onboarding: {
    coaches_onboarded: number;
    players_onboarded: number;
    coaches_total: number;
    players_total: number;
  };
  signup_trend_30d: { date: string; count: number }[];
}
/**
 * Non-throwing admin access probe.
 *
 * Returns the caller's authority to load admin data WITHOUT 500ing on the
 * unauth path. The page polls every 5 min while open; if the layout's SSR
 * guard ever lets a non-admin tab through (stale role row, session
 * downgraded mid-tab, etc.) the throw-based actions flood prod runtime
 * logs at ~576 errors/day. The dashboard gates on this check first and
 * stops polling cleanly when access drops — no 500.
 */
async function checkAdminAccessImpl(): Promise<{
  allowed: boolean;
  reason?: 'unauthenticated' | 'forbidden';
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, reason: 'unauthenticated' };

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userErr) {
    // A transient DB error is not an auth denial — re-throw so the caller
    // surfaces it as a retriable error rather than a permanent session
    // expiry. Collapsing it into `forbidden` would trip the client's
    // /\bForbidden\b/ guard and tear the polling timer down for a real
    // admin who just hit a Supabase hiccup.
    throw userErr instanceof Error ? userErr : new Error(String(userErr));
  }
  if (userRow?.role !== 'admin') {
    return { allowed: false, reason: 'forbidden' };
  }
  return { allowed: true };
}
/**
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedCheckAdminAccess = withAdminObserved(
  'checkAdminAccess',
  { sport: 'shared', feature: 'admin_dashboard' },
  checkAdminAccessImpl,
);
export async function checkAdminAccess(): Promise<{
  allowed: boolean;
  reason?: 'unauthenticated' | 'forbidden';
}> {
  return observedCheckAdminAccess();
}
/** Server-side entrypoint: admin check, then one RPC round-trip via the
 *  user-scoped client so the SECURITY DEFINER `auth.uid()` gate inside
 *  `get_admin_dashboard_rollup` resolves to the invoking admin (and not
 *  NULL, as it would under the service_role JWT). */
async function getAdminDashboardRollupImpl(): Promise<AdminDashboardRollup> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userErr || userRow?.role !== 'admin') throw new Error('Forbidden');

  // .bind() preserves `this` on the proxy; without it some bundler outputs
  // detach the rpc method from its parent client and the auth header gets
  // dropped on the underlying fetch. Same pattern as fetchAdminRollupA / C.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'get_admin_dashboard_rollup',
  ) => Promise<{ data: AdminDashboardRollup | null; error: unknown }>;
  const { data, error } = await rpc('get_admin_dashboard_rollup');
  if (error) throw error instanceof Error ? error : new Error(describeError(error));
  if (!data) throw new Error('Empty rollup response');
  return data;
}
/**
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedGetAdminDashboardRollup = withAdminObserved(
  'getAdminDashboardRollup',
  { sport: 'shared', feature: 'admin_dashboard' },
  getAdminDashboardRollupImpl,
);
export async function getAdminDashboardRollup(): Promise<AdminDashboardRollup> {
  return observedGetAdminDashboardRollup();
}
// ============================================
// VERCEL ANALYTICS HELPER
// ============================================

// Was a standalone duplicate of `fetchVercelWebInsights` (@/lib/admin/vercel-api)
// that predated it and never got repointed — its own doc comment even says
// "Port of the legacy fetchVercelAnalytics (admin-data.ts:1562)". The
// duplicate mapped `!res.ok` (expired/bad token, rate limit) to `0`, so a
// known-invalid Vercel token (#1568) rendered this card as "0 / 0 / 0
// visitors" — indistinguishable from genuinely zero traffic. The shared
// implementation already carries the fail-soft `AdminFetchResult` contract
// that treats an HTTP failure as `status: 'error'`, not a silent zero; this
// is now a thin adapter from that contract to the shape this module's BI
// section expects, rather than a second copy of the fetch logic.
async function fetchVercelAnalytics(): Promise<
  { visitors24h: number; visitors7d: number; visitors30d: number; status: 'ok' | 'unavailable' } | null
> {
  const res = await fetchVercelWebInsights();
  if (res.status === 'unconfigured') return null;
  if (res.status !== 'ok' || !res.data) {
    return { visitors24h: 0, visitors7d: 0, visitors30d: 0, status: 'unavailable' };
  }
  return { ...res.data, status: 'ok' };
}
// ============================================
// MAIN DATA FETCHER
// ============================================

/**
 * Aggregates the full `AdminDashboardData` shape consumed by the admin
 * dashboard UI. Behind the scenes this delegates to three parallel rollup
 * RPCs (`fetchAdminRollupA/B/C`) plus kept calls for Vercel analytics and
 * `get_platform_health_stats`. Replaces ~93 ad-hoc queries with ~10
 * Supabase round-trips.
 */
async function getAdminDashboardDataImpl(): Promise<AdminDashboardData> {
  const startTime = performance.now();

  // 1. Auth gate — MUST live outside the cache (reads cookies).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userErr || (userRow?.role as string) !== 'admin') throw new Error('Forbidden');

  // 2. Kick off Slice A + Slice B in parallel — Slice C needs Slice A's
  //    `allRoundsMinimal` so it runs in the next wave.
  //    Rollup A is REQUIRED (auth + roundsMinimal fuels rollupC). Rollup B
  //    and C can degrade to safe empties without crashing the page —
  //    Postgres statement_timeout on one of their RPCs is recoverable.
  // Only rollupA failures propagate out of this Promise.all; rollupB
  // gracefully degrades internally.
  // W15: this used to be wrapped in a try/catch that only re-logged +
  // rethrew the same error (no-useless-catch) — withAdminObserved now
  // captures the throw at the export boundary, so the wrapper was removed
  // rather than left as a no-op passthrough.
  const [rollupA, rollupB]: [RollupA, RollupB] = await Promise.all([
    fetchAdminRollupA().catch((e) => {
      throw new Error(`rollupA failed: ${describeError(e)}`);
    }),
    fetchAdminRollupB(),
  ]);

  const rollupBDegraded =
    rollupB.degradation.baseballRollupDegraded ||
    rollupB.degradation.errorsRollupDegraded ||
    rollupB.degradation.teamsRollupDegraded;

  // 3. Slice C + kept calls (Vercel HTTP + platform health RPC + one-off
  //    shot-quality counts) run in parallel. `dataQuality` is not owned by
  //    any slice — we issue a single grouped query.
  let rollupCDegraded = false;
  const [rollupC, vercelAnalytics, platformHealth, dataQualityRaw] = await Promise.all([
    fetchAdminRollupC(rollupA.allRoundsMinimal).catch((_e) => {
      // Audit N4: fetchAdminRollupC is itself withAdminObserved-wrapped, so
      // it already logs its own failure at the export boundary. Logging
      // again here would double-write admin_events for a single failure.
      rollupCDegraded = true;
      return EMPTY_ROLLUP_C;
    }),
    fetchVercelAnalytics(),
    (async (): Promise<PlatformHealthStatsResult | null> => {
      // get_platform_health_stats is `RETURNS TABLE(...)` (SETOF), so PostgREST
      // returns an array — even with a single row. Reading `res.data.x` directly
      // silently produces undefined and every `phs?.x ?? 0` fallback collapses
      // to zero, which is why the System tab showed DB Size 0.0 KB / Active
      // Sessions 0 / 0 connections even with the RPC working in SQL. Always
      // unwrap the first row.
      try {
        // The function's SECURITY DEFINER body authorizes with auth.uid().
        // A service-role client has no invoking admin UID and is therefore
        // deterministically rejected even after the outer auth gate passes.
        // Preserve the caller's JWT by using the authenticated server client.
        const rpc = supabase.rpc.bind(supabase) as unknown as (
          fn: 'get_platform_health_stats',
        ) => Promise<{ data: PlatformHealthStatsResult[] | null; error: unknown }>;
        const res = await rpc('get_platform_health_stats');
        if (res.error) {
          void logServerError(
            `[admin-data] get_platform_health_stats errored: ${describeError(res.error)}`,
            { action: 'admin_data.getAdminDashboardData', featureArea: 'admin' },
          );
          return null;
        }
        const rows = res.data ?? [];
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rows[0] ?? null;
      } catch (e) {
        void logServerError(
          `[admin-data] get_platform_health_stats threw: ${describeError(e)}`,
          { action: 'admin_data.getAdminDashboardData', featureArea: 'admin' },
        );
        return null;
      }
    })(),
    // Shot telemetry quality — single RPC `get_shot_data_quality` collapses
    // what used to be 4 separate `count(head=true)` calls on golf_shots into
    // one conditional-aggregation SELECT (migration
    // 20260428210000_get_shot_data_quality.sql). The RPC returns *missing*
    // counts; we derive shotsWithX = total - missingX so downstream
    // dataQuality consumers (assembleAdminDashboardData) keep the existing
    // shape.
    (async (): Promise<{
      totalShots: number;
      shotsWithDistance: number;
      shotsWithLie: number;
      shotsWithClub: number;
    }> => {
      const admin = createAdminClient();
      const rpc = admin.rpc.bind(admin) as unknown as (
        fn: 'get_shot_data_quality',
      ) => Promise<{
        data: {
          total_shots: number;
          missing_distance_before: number;
          missing_lie_before: number;
          missing_club_type: number;
        } | null;
        error: unknown;
      }>;
      try {
        const { data, error } = await rpc('get_shot_data_quality');
        if (error || !data) {
          if (error) {
            void logServerError(
              `[admin-data] get_shot_data_quality errored: ${describeError(error)}`,
              { action: 'admin_data.getAdminDashboardData', featureArea: 'admin' },
            );
          }
          return { totalShots: 0, shotsWithDistance: 0, shotsWithLie: 0, shotsWithClub: 0 };
        }
        const total = Number(data.total_shots ?? 0);
        const missingDistance = Number(data.missing_distance_before ?? 0);
        const missingLie = Number(data.missing_lie_before ?? 0);
        const missingClub = Number(data.missing_club_type ?? 0);
        return {
          totalShots: total,
          shotsWithDistance: Math.max(0, total - missingDistance),
          shotsWithLie: Math.max(0, total - missingLie),
          shotsWithClub: Math.max(0, total - missingClub),
        };
      } catch (e) {
        void logServerError(
          `[admin-data] get_shot_data_quality threw: ${describeError(e)}`,
          { action: 'admin_data.getAdminDashboardData', featureArea: 'admin' },
        );
        return { totalShots: 0, shotsWithDistance: 0, shotsWithLie: 0, shotsWithClub: 0 };
      }
    })(),
  ]);

  const responseTime = Math.round(performance.now() - startTime);

  try {
    const assembled = assembleAdminDashboardData({
      rollupA,
      rollupB,
      rollupC,
      vercelAnalytics,
      platformHealth,
      dataQualityRaw,
      responseTime,
    });
    // Merge rollup-level degradation flags onto the public shape. Downstream
    // components (error banner on admin/page.tsx) read these to signal
    // partial-data mode without crashing.
    return {
      ...assembled,
      rollupBDegraded,
      rollupCDegraded,
    };
  } catch (e) {
    // W15: inline logServerError removed here — withAdminObserved now
    // captures this throw at the export boundary (no more double-log).
    throw new Error(`assembleAdminDashboardData failed: ${describeError(e)}`, { cause: e });
  }
}
/**
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedGetAdminDashboardData = withAdminObserved(
  'getAdminDashboardData',
  { sport: 'shared', feature: 'admin_dashboard' },
  getAdminDashboardDataImpl,
);
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  return observedGetAdminDashboardData();
}
