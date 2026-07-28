/**
 * CoachHelm safety-net cron.
 *
 * Re-runs the post-round trigger for any round whose terminal state columns
 * are still NULL — meaning the round-submit `after(postRoundTrigger)` call
 * never wrote success or failure for it.
 *
 * 2026-05-17 rewrite (Plan 04 / audit P-CRIT-2 + A-NEW-6 + Q-NEW-4):
 *   - Replaces the previous heuristic ("any active insight after
 *     round.created_at" wins → skip) with a deterministic state-column
 *     query. The heuristic could be defeated by lifecycle cron refreshes
 *     and manual acknowledgements creating unrelated newer rows.
 *   - Replaces the sequential per-player loop with chunked Promise.allSettled
 *     so 100+ pending rounds finish well inside the 300s function budget.
 *   - Calls postRoundTrigger (same wrapper the round submit uses) so the
 *     state columns get set consistently from both call sites.
 *
 * 2026-07-25 rewrite (Fix 1 of the CoachHelm remediation plan): the
 * eligibility query used to also require `created_at >= now() - 30d` on
 * top of the terminal-state gate above. That rolling window is what let
 * 112 (then 200) completed rounds go permanently unanalyzed while this
 * cron reported success on all 332 of its runs in that period — the
 * moment a stranded round aged past the window, it silently dropped out
 * of the query for good, with nothing anywhere recording that it had
 * happened. Widening the window from 24h to 30d on 2026-05-23 to drain
 * an earlier backlog didn't fix this; it only delayed the same failure
 * mode until the backlog regrew. The date filter is gone: eligibility is
 * now purely `status='completed' AND coachhelm_analyzed_at IS NULL AND
 * coachhelm_failed_at IS NULL` — deterministic and age-independent, and
 * still cheap thanks to the partial index from migration 20260517010000.
 * STALE_THRESHOLD_MS below is reporting-only now: it drives a
 * `logServerError` warning when the eligible backlog itself contains rows
 * older than the threshold, so a silent backlog can never again hide
 * behind a query window that simply stopped looking.
 *
 * 2026-07-25 companion change (Fix 3 of the same plan, layered on top of
 * the rewrite above — same file, applied second): round submits now route
 * through Inngest for durable retries when INNGEST_EVENT_KEY/
 * INNGEST_SIGNING_KEY are configured (src/app/golf/actions/golf.ts,
 * src/lib/inngest/functions.ts's onCoachHelmRoundSubmitted). This cron is
 * still the correct backstop either way — Inngest delivery isn't
 * guaranteed to be configured, and even when it is, a durable retry can
 * still exhaust its attempts. MIN_AGE_MS below adds a floor so this cron
 * doesn't fire a redundant direct call while a round is still inside its
 * first Inngest attempt's own retry backoff window; see the constant's own
 * comment for the exact math. This cron never calls Inngest itself — it
 * always calls postRoundTrigger directly, which is fine: a 30-minute
 * re-scheduled cron tick is itself already a durable retry mechanism.
 *
 * Schedule: every 30 min (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
import { classifySoftFailure } from '@/lib/admin/observe-action-result';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const DEFAULT_STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

// Reporting-only staleness threshold — see the header comment. Not a query
// filter; only decides when the stale-backlog alarm fires. Optionally
// overridable via env for tuning alert sensitivity without a code change.
const STALE_THRESHOLD_MS = (() => {
  const raw = process.env.COACHHELM_SAFETY_NET_STALE_THRESHOLD_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_THRESHOLD_MS;
})();
const BATCH_LIMIT = 200;
const CONCURRENCY = 5;

// 2026-07-25 addition (Fix 3 of the CoachHelm remediation plan, layered on
// top of the 2026-07-25 rewrite above): a floor so this cron never
// re-triggers a round that's still inside its first Inngest attempt's own
// retry backoff window. Inngest's documented default retry backoff is a
// fixed table — 15s, 30s, 1m, 2m, ... — plus up to 30s of jitter per
// attempt (github.com/inngest/inngest pkg/backoff/backoff.go). For
// `retries: 3` (see onCoachHelmRoundSubmitted in
// src/lib/inngest/functions.ts), the worst case delay before the LAST
// retry attempt even starts is 15s+30s+60s = 105s base + up to 3*30s = 90s
// jitter = up to 195s (3m15s). The plan's starting suggestion was 5
// minutes; this uses 10 minutes instead — over 3x the 195s backoff-only
// figure, leaving ~405s of headroom for the final attempt's own execution
// time (including LLM calls) instead of the ~105s a 5-minute floor would
// leave. The extra 5 minutes costs nothing in practice: this cron only
// runs every 30 minutes, so a 5-vs-10-minute floor changes which of the
// next one or two ticks first sees a given round, not whether it's
// eventually recovered — the age-independent eligibility gate above
// guarantees that regardless. NOT required for correctness:
// postRoundTrigger's terminal write is idempotent at the column level and
// duplicate insight rows are structurally prevented by
// golf_coach_insights's unique dedup index — this floor only avoids
// wasted duplicate engine runs while an Inngest retry may still succeed.
const MIN_AGE_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('coachhelm-safety-net', () => handleSafetyNet());
}

async function handleSafetyNet(): Promise<NextResponse> {
  const supabase = createAdminClient();

  // Deterministic eligibility: completed rounds where postRoundTrigger
  // never wrote a terminal state, regardless of age. The partial index
  // added in migration 20260517010000 (WHERE coachhelm_analyzed_at IS NULL
  // AND coachhelm_failed_at IS NULL AND status='completed') keeps this
  // query cheap without needing a date filter to narrow the scan.
  //
  // The `.lte('created_at', ...)` MIN_AGE_MS floor (see const above) is
  // layered on top for Fix 3: it excludes rounds still inside their first
  // Inngest attempt's own retry window so this cron doesn't race a
  // still-in-flight durable retry with a redundant direct call.
  const minAgeCutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rounds, error } = await (supabase as any)
    .from('golf_rounds')
    .select('id, player_id, created_at')
    .eq('status', 'completed')
    .is('coachhelm_analyzed_at', null)
    .is('coachhelm_failed_at', null)
    .lte('created_at', minAgeCutoffIso)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    await logServerError(
      `cron.safetyNet.fetchRounds failed: ${error.message}`,
      {
        action: 'cron.coachhelm.safetyNet.fetchRounds',
        featureArea: 'coachhelm',
        extra: { code: error.code },
      },
      'error',
    );
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  const pending: Array<{ id: string; player_id: string; created_at: string }> = (rounds ?? []) as Array<{ id: string; player_id: string; created_at: string }>;

  // Honest self-reporting: the eligibility query above no longer has a date
  // window to hide behind, so if a genuinely stale backlog exists it shows
  // up right here in `pending` — flag it instead of letting a clean
  // `pending: 0`-eventually run past it in silence like the old window did.
  // Numeric comparison, not string: `r.created_at` is a Postgres timestamptz
  // string over PostgREST, which isn't guaranteed to compare the same way
  // as `Date#toISOString()`'s suffix/precision under a raw `<`.
  const staleCutoff = Date.now() - STALE_THRESHOLD_MS;
  const staleCutoffIso = new Date(staleCutoff).toISOString();
  const staleBacklog = pending.filter((r) => new Date(r.created_at).getTime() < staleCutoff);

  if (staleBacklog.length > 0) {
    const oldest = staleBacklog[0]!;

    // `staleBacklog` is a subset of a BATCH_LIMIT-capped page, so its length
    // saturates at BATCH_LIMIT and cannot distinguish a 200-round backlog from
    // a 20,000-round one — the alarm was structurally incapable of reporting
    // the number an operator needs. Count the real thing with a HEAD query on
    // the same predicate, so it rides the same partial index (20260517010000)
    // and stays cheap. Best-effort: a failure here must never suppress the
    // alarm, so fall back to the (understated) page count and say so.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: staleTotal, error: staleCountError } = await (supabase as any)
      .from('golf_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .is('coachhelm_analyzed_at', null)
      .is('coachhelm_failed_at', null)
      .lte('created_at', minAgeCutoffIso)
      .lt('created_at', staleCutoffIso);

    await logServerError(
      // Count-stable message: the count used to be interpolated here, and
      // incident fingerprints hash a normalised message prefix that only
      // redacts integers of 5+ digits (lib/admin/incident-grouping.ts). So
      // every distinct backlog size minted a BRAND-NEW incident — "200" and
      // "20" from two consecutive ticks of one draining backlog arrived as two
      // unrelated warnings, neither of which could dedupe or stay resolved.
      // The numbers live in `extra` instead; same rule the gated-insight
      // emitter already follows (actions/insights.ts).
      'cron.safetyNet.staleBacklog: completed round(s) have sat unanalyzed past the staleness threshold',
      {
        action: 'cron.coachhelm.safetyNet.staleBacklog',
        featureArea: 'coachhelm',
        extra: {
          staleCount: staleCountError ? null : staleTotal ?? null,
          staleCountUnavailable: staleCountError ? staleCountError.message : undefined,
          // Kept alongside the true total so a saturated page is legible as
          // such rather than looking like the whole backlog.
          staleInThisPage: staleBacklog.length,
          batchLimit: BATCH_LIMIT,
          pageSaturated: pending.length === BATCH_LIMIT,
          thresholdDays: Math.round(STALE_THRESHOLD_MS / (24 * 60 * 60 * 1000)),
          totalPending: pending.length,
          oldestRoundId: oldest.id,
          oldestCreatedAt: oldest.created_at,
        },
      },
      'warning',
    );
  }

  let recovered = 0;
  let failed = 0;
  // Outcomes the engine itself classified as routine (an un-rostered player,
  // a player with no rounds in the lookback). They are terminal — the trigger
  // stamped coachhelm_failed_at, so they leave the eligibility query and are
  // never retried — but they are not cron failures, and counting them as such
  // made every tick that touched one report `failed > 0` forever.
  let skippedExpected = 0;

  // Chunked Promise.allSettled — runs CONCURRENCY postRoundTrigger calls
  // in parallel. Each call writes terminal state to its round's
  // coachhelm_{analyzed,failed}_at column, so subsequent cron runs skip
  // automatically.
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((round) =>
        postRoundTrigger(supabase, {
          playerId: round.player_id,
          roundId: round.id,
          triggerReason: 'safety_net',
        }),
      ),
    );
    for (let j = 0; j < settled.length; j++) {
      const result = settled[j]!;
      if (result.status === 'fulfilled' && result.value.success) {
        recovered++;
      } else {
        const round = chunk[j]!;
        const reason = result.status === 'fulfilled'
          ? result.value.error
          : result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        // A rejected promise has no engine classification, so it stays a hard
        // failure. A fulfilled `{ success: false }` carries the engine's own
        // `code`, and this cron must reach the SAME verdict postRoundTrigger
        // already reached for it — otherwise the identical outcome is logged
        // twice with two different severities, which is exactly how routine
        // states ("No active team membership for player", "No completed
        // rounds in the last 90 days") kept reappearing in the Errors tab
        // at 'error' moments after being logged at 'warning'/'info'.
        const code = result.status === 'fulfilled' ? (result.value.code ?? null) : null;
        const { severity, skipSentry } = classifySoftFailure(reason ?? 'unknown failure', code);
        if (severity === 'error') failed++;
        else skippedExpected++;

        const message = `cron.safetyNet.postRoundTrigger failed: ${reason ?? 'unknown failure'}`;
        const logContext = {
          action: 'cron.coachhelm.safetyNet.postRoundTrigger',
          featureArea: 'coachhelm',
          playerId: round.player_id,
          ...(skipSentry ? { skipSentry: true } : {}),
          ...(code ? { errorCode: code } : {}),
          extra: { roundId: round.id },
        };
        if (severity === 'info') {
          await logServerEvent(message, logContext, 'info');
        } else {
          await logServerError(message, logContext, severity);
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    pending: pending.length,
    recovered,
    failed,
    skippedExpected,
    concurrency: CONCURRENCY,
  });
}
