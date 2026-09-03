import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { scheduleBridgeWrite } from '@/lib/admin/schedule-bridge-write';
import { shouldEmit } from '@/lib/admin/emit-throttle';

/**
 * Readiness probe — GET /api/health.
 *
 * Phase A findings (docs/observability/SENTRY_PHASE_A_FINDINGS.md §(i)):
 * this route existed but a degraded result was entirely silent (no
 * logServerError, no Sentry, no admin_events row — nothing but the JSON
 * body itself), and it always returned HTTP 200 even when the DB probe
 * failed, so nothing that treats 200 as "healthy" (a load balancer, an
 * uptime check) could ever notice a real outage from the status code alone.
 *
 * BOUNDED, EXPLICITLY. `.abortSignal(AbortSignal.timeout(...))` — the same
 * pattern already used at src/app/golf/actions/insight-delivery.ts:396 —
 * puts a hard 2.5s ceiling on the readiness query itself, independent of
 * whatever REQUEST_TIMEOUT_MS the underlying Supabase client carries
 * (35s, sized for round-submit RPCs with their own raised statement_timeout —
 * see server.ts's own header comment). A readiness probe that itself hangs
 * for 35s defeats the entire point of having one.
 *
 * `users` (not sport-prefixed) is used deliberately, not by oversight — it
 * is a real, small, canonical table (verified against
 * src/lib/types/database.ts; the last entry in `Tables`, confirming it is
 * `public.users`, not `auth.users`) that this exact query already probed in
 * production before this change. Switching to an unverified sport-prefixed
 * table would trade a known-working read for an unverified one on the one
 * route whose entire job is telling the truth about whether the database is
 * reachable.
 *
 * NEVER a deployment id/URL/secret in the body — `release` (git SHA) is the
 * standard Sentry release identifier and does not let an unauthenticated
 * caller enumerate anything Vercel-internal the way `deploymentId` could.
 * scripts/warm-edge.ts (the one real consumer, verified via
 * `grep -rln "api/health" .github .circleci scripts vercel.json e2e`) reads
 * `release` now instead of the old `deploymentId` field.
 */
const READINESS_QUERY_TIMEOUT_MS = 2_500;
const DEGRADED_LOG_THROTTLE_KEY = 'api.health.degraded';
const DEGRADED_LOG_THROTTLE_WINDOW_MS = 60_000;

export async function GET() {
  const startedAt = Date.now();
  let database: 'ok' | 'error' = 'ok';
  let status: 'healthy' | 'degraded' = 'healthy';
  let errorDetail: string | undefined;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(READINESS_QUERY_TIMEOUT_MS));

    if (error) {
      database = 'error';
      status = 'degraded';
      errorDetail = error.message;
    }
  } catch (err) {
    database = 'error';
    status = 'degraded';
    errorDetail = err instanceof Error ? err.message : String(err);
  }

  if (status === 'degraded' && shouldEmit(DEGRADED_LOG_THROTTLE_KEY, DEGRADED_LOG_THROTTLE_WINDOW_MS)) {
    // Once per minute at most (shouldEmit's own collapse window) — a health
    // check runs far more often than that, and a real outage would otherwise
    // flood admin_events with one row per poll. skipSentry:true: a single
    // transient blip shouldn't page (Phase A's own recommendation for this
    // exact finding), but it SHOULD stay visible in admin_events for trend
    // purposes — a sustained degradation is still findable there.
    await scheduleBridgeWrite(() =>
      logServerError(
        'Health check degraded: readiness query failed',
        {
          action: 'api.health',
          source: 'route_handler',
          skipSentry: true,
          errorDetails: errorDetail,
        },
        'warning',
      ),
    );
  }

  const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown';

  return NextResponse.json(
    {
      status,
      database,
      release,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
    },
    { status: status === 'healthy' ? 200 : 503 },
  );
}
