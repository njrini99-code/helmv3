/**
 * CoachHelm safety-net cron.
 *
 * If a round-submit `fetch('/api/coachhelm/analyze-player', { keepalive })`
 * call is lost (serverless exit, network blip, secret misconfigured), the
 * player never gets insights for that round. This cron finds rounds in the
 * last 24h whose player has no active insights created after the round's
 * `round_date`, and re-triggers analyze-player for them.
 *
 * Schedule: every 30 min (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 200;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();

  const { data: rounds, error } = await supabase
    .from('golf_rounds')
    .select('id, player_id, round_date')
    .eq('status', 'completed')
    .gte('round_date', sinceIso)
    .order('round_date', { ascending: false })
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
  // at the whole player anyway).
  const latestPerPlayer = new Map<string, { id: string; round_date: string }>();
  for (const r of rounds ?? []) {
    if (!latestPerPlayer.has(r.player_id)) {
      latestPerPlayer.set(r.player_id, { id: r.id, round_date: r.round_date ?? sinceIso });
    }
  }

  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const [playerId, round] of latestPerPlayer.entries()) {
    try {
      // Has any active v2 insight been created since this round was recorded?
      // If yes, the regular round-submit trigger worked and we skip.
      const { data: existing, error: existErr } = await supabase
        .from('golf_coach_insights')
        .select('id')
        .eq('player_id', playerId)
        .eq('status', 'active')
        .gte('created_at', round.round_date)
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
