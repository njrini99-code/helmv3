/**
 * CoachHelm safety-net cron.
 *
 * If a round-submit `fetch('/api/coachhelm/analyze-player', { keepalive })`
 * call is lost (serverless exit, network blip, secret misconfigured), the
 * player never gets insights for that round. This cron finds rounds whose
 * `created_at` falls in the last 24h and that have no active insight
 * created after the round's submission timestamp, then re-triggers
 * analyze-player for the affected players.
 *
 * Schedule: every 30 min (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 200;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();

  // Filter on `created_at` (submission timestamp) rather than `round_date`
  // (DATE column at midnight). Without this, comparing the round's date to
  // the lookback timestamp truncates same-day rounds and the downstream
  // "newer insight exists" check below gets a midnight floor that any
  // earlier-in-the-day insight beats.
  const { data: rounds, error } = await supabase
    .from('golf_rounds')
    .select('id, player_id, created_at')
    .eq('status', 'completed')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
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

  // Deduplicate: process the newest round per player. If a player has 3
  // rounds in the window we only re-run analysis once (analyzePlayer looks
  // at the whole player anyway). Track the round's actual submission
  // timestamp (created_at) so the "newer insight exists" check below
  // compares against the precise submit moment rather than midnight.
  const latestPerPlayer = new Map<string, { id: string; submittedAt: string }>();
  for (const r of rounds ?? []) {
    if (!latestPerPlayer.has(r.player_id)) {
      latestPerPlayer.set(r.player_id, {
        id: r.id,
        submittedAt: r.created_at ?? sinceIso,
      });
    }
  }

  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const [playerId, round] of latestPerPlayer.entries()) {
    try {
      // Has any active v2 insight been created since this round was submitted?
      // If yes, the regular round-submit trigger worked and we skip. Using
      // the round's created_at (full timestamp) instead of round_date (date
      // truncated to midnight) prevents earlier-in-the-day insights from
      // masking a missed analysis.
      const { data: existing, error: existErr } = await supabase
        .from('golf_coach_insights')
        .select('id')
        .eq('player_id', playerId)
        .eq('status', 'active')
        .gte('created_at', round.submittedAt)
        .limit(1);

      if (existErr) {
        failed++;
        await logServerError(
          `cron.safetyNet.checkExisting failed: ${existErr.message}`,
          {
            action: 'cron.coachhelm.safetyNet.checkExisting',
            featureArea: 'coachhelm',
            extra: { playerId, roundId: round.id, code: existErr.code },
          },
          'warning',
        );
        continue;
      }

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Re-run analysis. Call the action directly (same Node process) rather
      // than another HTTP hop — the cron already runs on a Fluid-Compute
      // maxDuration=300 function so we have budget.
      const result = await triggerPlayerInsightsAfterRound(playerId);
      if (result.success) {
        recovered++;
      } else {
        skipped++; // engine opted out (disabled team, etc.) — not a failure
      }
    } catch (err) {
      failed++;
      await logServerError(
        `cron.safetyNet.recover failed: ${err instanceof Error ? err.message : String(err)}`,
        {
          action: 'cron.coachhelm.safetyNet.recover',
          featureArea: 'coachhelm',
          extra: {
            playerId,
            roundId: round.id,
            stack: err instanceof Error ? err.stack : undefined,
          },
        },
        'error',
      );
    }
  }

  return NextResponse.json({
    success: true,
    roundsWindowed: (rounds ?? []).length,
    uniquePlayers: latestPerPlayer.size,
    recovered,
    skipped,
    failed,
  });
}
