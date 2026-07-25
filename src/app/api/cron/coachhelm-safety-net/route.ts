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
 * Schedule: every 30 min (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
import { logServerError } from '@/lib/server-error-logger';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rounds, error } = await (supabase as any)
    .from('golf_rounds')
    .select('id, player_id, created_at')
    .eq('status', 'completed')
    .is('coachhelm_analyzed_at', null)
    .is('coachhelm_failed_at', null)
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
  const staleBacklog = pending.filter((r) => new Date(r.created_at).getTime() < staleCutoff);
  if (staleBacklog.length > 0) {
    const oldest = staleBacklog[0]!;
    await logServerError(
      `cron.safetyNet.staleBacklog: ${staleBacklog.length} completed round(s) have sat unanalyzed longer than the ${Math.round(STALE_THRESHOLD_MS / (24 * 60 * 60 * 1000))}-day staleness threshold`,
      {
        action: 'cron.coachhelm.safetyNet.staleBacklog',
        featureArea: 'coachhelm',
        extra: {
          staleCount: staleBacklog.length,
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
        failed++;
        const round = chunk[j]!;
        const reason = result.status === 'fulfilled'
          ? result.value.error
          : result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        await logServerError(
          `cron.safetyNet.postRoundTrigger failed: ${reason ?? 'unknown failure'}`,
          {
            action: 'cron.coachhelm.safetyNet.postRoundTrigger',
            featureArea: 'coachhelm',
            playerId: round.player_id,
            extra: { roundId: round.id },
          },
          'error',
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    pending: pending.length,
    recovered,
    failed,
    concurrency: CONCURRENCY,
  });
}
