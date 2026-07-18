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
// Side-effect-only: guarantees insights.ts's module-scope registration
// (__registerTriggerPlayerInsightsAfterRound) has run at module-init time —
// the bridge no longer lazily imports insights.ts itself (that dynamic
// back-edge was the cold-start TDZ cycle; see trigger-insights-bridge.ts).
import '@/app/golf/actions/insights';
import { triggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CONCURRENCY = 3;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('coachhelm-roster-sweep', () => handleRosterSweep());
}

async function handleRosterSweep(): Promise<NextResponse> {
  const supabase = createAdminClient();

  // Paginated: platform-wide, unfiltered fetch across every active roster —
  // easily exceeds the PostgREST 1000-row cap once enough teams have active
  // members (mirrors event-reminders' use of fetchAllRowsResult).
  const { data: memberships, error } = await fetchAllRowsResult<{ player_id: string; team_id: string }>(
    (from, to) =>
      supabase
        .from('golf_team_members')
        .select('player_id, team_id')
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_team_members', action: 'cron.coachhelm.rosterSweep.fetchMembers', sport: 'golf' },
  );

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
  // Player's MOST RECENT completed round already had coachhelm_analyzed_at
  // set — genuinely nothing new to analyze.
  let alreadyAnalyzedSkipped = 0;
  // Engine opted out for other reasons (team disabled, no coach, no
  // completed rounds at all, etc.) — not an error.
  let skipped = 0;
  let failed = 0;

  // Process players in small batches to keep engine load bounded.
  for (let i = 0; i < uniquePlayerIds.length; i += CONCURRENCY) {
    const batch = uniquePlayerIds.slice(i, i + CONCURRENCY);
    const pairs = await Promise.all(
      batch.map(async (playerId) => {
        try {
          // 2026-07-17: closes #920 (roster-sweep skip). Skip ONLY when the
          // player's MOST RECENT completed round already has
          // coachhelm_analyzed_at set — not "any round analyzed within the
          // last 12h" (the old SKIP_IF_ANALYZED_WITHIN_MS window). That
          // window let a player who had just logged a fresh, unanalyzed
          // round get skipped anyway, because an EARLIER round of theirs
          // happened to be (re-)analyzed inside the same 12h — the sweep
          // never noticed the genuinely stale latest round. Checking only
          // the latest completed round's terminal state means the sweep
          // fires whenever there is real unanalyzed data, no matter when
          // some other round was last touched.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: latestRound, error: latestRoundError } = await (supabase as any)
            .from('golf_rounds')
            .select('coachhelm_analyzed_at')
            .eq('player_id', playerId)
            .eq('status', 'completed')
            .order('round_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestRoundError) {
            // Fail open — a transient lookup error shouldn't silently skip
            // a player forever; fall through to the engine call.
            await logServerError(
              `cron.rosterSweep.latestRound failed: ${latestRoundError.message}`,
              {
                action: 'cron.coachhelm.rosterSweep.latestRound',
                featureArea: 'coachhelm',
                extra: { playerId, code: latestRoundError.code },
              },
              'warning',
            );
          } else if (latestRound?.coachhelm_analyzed_at) {
            return { playerId, ok: true as const, alreadyAnalyzed: true as const };
          }

          const result = await triggerPlayerInsightsAfterRound(playerId);
          return { playerId, ok: true as const, alreadyAnalyzed: false as const, result };
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
      if (p.alreadyAnalyzed) {
        alreadyAnalyzedSkipped++;
        continue;
      }
      if (p.result.success) {
        analyzed++;
      } else {
        // Engine opted out (team disabled, no coach, no completed rounds, etc.) — not an error.
        skipped++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    playersTotal: uniquePlayerIds.length,
    playersProcessed: uniquePlayerIds.length - alreadyAnalyzedSkipped,
    alreadyAnalyzedSkipped,
    analyzed,
    skipped,
    failed,
  });
}
