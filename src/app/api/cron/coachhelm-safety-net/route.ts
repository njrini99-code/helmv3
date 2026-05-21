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
 * Schedule: every 30 min (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 200;
const CONCURRENCY = 5;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();

  // Deterministic eligibility: completed rounds where postRoundTrigger
  // never wrote a terminal state. The partial index added in migration
  // 20260517010000 keeps this query cheap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rounds, error } = await (supabase as any)
    .from('golf_rounds')
    .select('id, player_id, created_at')
    .eq('status', 'completed')
    .is('coachhelm_analyzed_at', null)
    .is('coachhelm_failed_at', null)
    .gte('created_at', sinceIso)
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

  const pending: Array<{ id: string; player_id: string }> = (rounds ?? []) as Array<{ id: string; player_id: string }>;

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
