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
 * `organizations_public_profile` is probed, not `users`. The probe runs with
 * the cookie client, so a monitor or scripts/warm-edge.ts (no session) reads
 * as `anon`. Held migration 20261007102000_revoke_anon_public_table_grants
 * removes anon's SELECT on `users`, which would turn every signed-out probe
 * into a permission error and a 503. This view keeps an explicit anon SELECT
 * grant (that same migration re-grants it, and the public team/program pages
 * read it signed out), is readable by `authenticated` too, and is a small,
 * canonical read (typed under `Views` in src/lib/types/database.ts). Before
 * 2026-10-23 this probed `users`; the swap keeps the probe answering the one
 * question it exists for, whether PostgREST and the database are reachable.
 *
 * NEVER a deployment id/URL/secret in the body — `release` (git SHA) is the
 * standard Sentry release identifier and does not let an unauthenticated
 * caller enumerate anything Vercel-internal the way `deploymentId` could.
 * scripts/warm-edge.ts (the one real consumer, verified via
 * `grep -rln "api/health" .github .circleci scripts vercel.json e2e`) reads
 * `release` now instead of the old `deploymentId` field.
 */
const READINESS_QUERY_TIMEOUT_MS = 2_500;
/** A timed-out first read gets one more attempt; see the loop in GET. */
const READINESS_MAX_ATTEMPTS = 2;
const DEGRADED_LOG_THROTTLE_KEY = 'api.health.degraded';
const DEGRADED_LOG_THROTTLE_WINDOW_MS = 60_000;

function isTimeoutMessage(message: string): boolean {
  return /\bTimeoutError\b|aborted due to timeout|signal timed out/i.test(message);
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error || (typeof DOMException !== 'undefined' && err instanceof DOMException)) {
    const { name, message } = err as { name: string; message: string };
    return name === 'TimeoutError' || name === 'AbortError' || isTimeoutMessage(message);
  }
  return isTimeoutMessage(String(err));
}

export async function GET() {
  const startedAt = Date.now();
  let database: 'ok' | 'error' = 'ok';
  let status: 'healthy' | 'degraded' = 'healthy';
  let errorDetail: string | undefined;
  let failureKind: 'timeout' | 'error' | undefined;
  // Phase timings for the degraded row. Without them a cold start, a thawed
  // instance with a dead keep-alive socket and a genuinely slow database all
  // produce the same "TimeoutError" row (5725d96a sat in NEEDS MORE EVIDENCE
  // for three consecutive self-heal runs on 2026-09-24 for exactly this).
  let createClientMs: number | undefined;
  let queryStartedAt: number | undefined;

  // One more attempt, on a fresh request, when (and only when) the first one timed out. 5725d96a regressed on
  // 2026-10-14 on WARM instances (uptime 15-72 min, createClientMs 0-9): Supabase's edge logs show each failing
  // probe either never reached PostgREST or reached it seconds late and was answered 200, while db_health_samples
  // showed an idle database. That is one stalled connection from the instance, not the database being down — and
  // a readiness probe exists to report the database. Two timeouts in a row still read as degraded. A PostgREST
  // error is not retried: the database answered, and the answer was no.
  let attempts = 0;
  while (attempts < READINESS_MAX_ATTEMPTS) {
    attempts += 1;
    database = 'ok';
    status = 'healthy';
    errorDetail = undefined;
    failureKind = undefined;
    try {
      const attemptStartedAt = Date.now();
      const supabase = await createClient();
      createClientMs = Date.now() - attemptStartedAt;
      queryStartedAt = Date.now();
      const { error } = await supabase
        .from('organizations_public_profile')
        .select('id')
        .limit(1)
        .abortSignal(AbortSignal.timeout(READINESS_QUERY_TIMEOUT_MS));

      if (error) {
        database = 'error';
        status = 'degraded';
        errorDetail = error.message;
        failureKind = isTimeoutMessage(error.message) ? 'timeout' : 'error';
      }
    } catch (err) {
      database = 'error';
      status = 'degraded';
      errorDetail = err instanceof Error ? err.message : String(err);
      failureKind = isTimeoutError(err) ? 'timeout' : 'error';
    }
    if (failureKind !== 'timeout') break;
  }
  const queryMs = queryStartedAt === undefined ? null : Date.now() - queryStartedAt;

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
          metadata: {
            failureKind,
            queryTimeoutMs: READINESS_QUERY_TIMEOUT_MS,
            createClientMs: createClientMs ?? null,
            queryMs,
            attempts,
            instanceUptimeMs: Math.round(process.uptime() * 1000),
          },
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
