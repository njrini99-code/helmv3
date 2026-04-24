/**
 * CoachHelm roster-sweep cron.
 *
 * The safety-net cron only picks up players who submitted a round in the last
 * 24h. Roster players whose coach never logs a round for them — or whose
 * earlier insights have aged out — never get re-analyzed. This job sweeps
 * every active roster player nightly and re-runs the V2 engine so coach
 * dashboards always reflect fresh analysis (trends, weaknesses, focus areas)
 * for the whole team, not just the players who happened to play yesterday.
 *
 * Schedule: nightly at 03:45 (see vercel.json). Sits between lifecycle (02:00)
 * and calibration (03:30) so insights lifecycle transitions have already run.
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerPlayerInsightsAfterRound } from '@/app/golf/actions/insights';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CONCURRENCY = 3;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: memberships, error } = await supabase
    .from('golf_team_members')
    .select('player_id, team_id')
    .eq('status', 'active');

  if (error) {
    await logServerError(
      `cron.rosterSweep.fetchMembers failed: ${error.message}`,
      {
        action: 'cron.coachhelm.rosterSweep.fetchMembers',
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

  const uniquePlayerIds = Array.from(
    new Set((memberships ?? []).map((m) => m.player_id).filter(Boolean)),
  );

  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  // Process players in small batches to keep engine load bounded.
  for (let i = 0; i < uniquePlayerIds.length; i += CONCURRENCY) {
    const batch = uniquePlayerIds.slice(i, i + CONCURRENCY);
    const pairs = await Promise.all(
      batch.map(async (playerId) => {
        try {
          const result = await triggerPlayerInsightsAfterRound(playerId);
          return { playerId, ok: true as const, result };
        } catch (err) {
          return { playerId, ok: false as const, err };
        }
      }),
    );
    for (const p of pairs) {
      if (!p.ok) {
        failed++;
        await logServerError(
          `cron.rosterSweep.trigger rejected: ${p.err instanceof Error ? p.err.message : String(p.err)}`,
          {
            action: 'cron.coachhelm.rosterSweep.trigger',
            featureArea: 'coachhelm',
            extra: { playerId: p.playerId },
          },
          'warning',
        );
        continue;
      }
      if (p.result.success) {
        analyzed++;
      } else {
        // Engine opted out (team disabled, no coach, etc.) — not an error.
        skipped++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    playersTotal: uniquePlayerIds.length,
    analyzed,
    skipped,
    failed,
  });
}
