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
import { triggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CONCURRENCY = 3;
// Skip players whose most recent round was already analyzed within this
// window — the safety-net cron (30 min) + post-round trigger already cover
// fresh activity, and the nightly sweep otherwise re-runs the engine on
// every roster player every night even when nothing changed (3× per round
// in the worst case). 12h is half the daily sweep window — gives a small
// safety margin while skipping the obvious redundant re-runs.
const SKIP_IF_ANALYZED_WITHIN_MS = 12 * 60 * 60 * 1000;

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

  // 2026-05-23: skip players whose most recent round was analyzed within
  // SKIP_IF_ANALYZED_WITHIN_MS (audit P1-3 — was re-running engine 3× per
  // round between this sweep + safety-net + post-round trigger).
  const recencyCutoff = new Date(Date.now() - SKIP_IF_ANALYZED_WITHIN_MS).toISOString();
  // Paginated: one row per analyzed round (not per player), so a large
  // roster with many rounds analyzed inside the window can exceed the
  // PostgREST 1000-row cap just as easily as the unfiltered members query
  // above.
  const { data: recentRounds } = await fetchAllRowsResult<{ player_id: string }>(
    (from, to) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_rounds')
        .select('player_id')
        .in('player_id', uniquePlayerIds)
        .gte('coachhelm_analyzed_at', recencyCutoff)
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_rounds', action: 'cron.coachhelm.rosterSweep.recentRounds', sport: 'golf' },
  );
  const recentlyAnalyzedPlayerIds = new Set(
    ((recentRounds ?? []) as Array<{ player_id: string }>).map((r) => r.player_id),
  );
  const playersToProcess = uniquePlayerIds.filter((id) => !recentlyAnalyzedPlayerIds.has(id));

  let analyzed = 0;
  let skipped = recentlyAnalyzedPlayerIds.size; // count skip-recent toward skipped
  let failed = 0;

  // Process players in small batches to keep engine load bounded.
  for (let i = 0; i < playersToProcess.length; i += CONCURRENCY) {
    const batch = playersToProcess.slice(i, i + CONCURRENCY);
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
    playersProcessed: playersToProcess.length,
    recentlyAnalyzedSkipped: recentlyAnalyzedPlayerIds.size,
    analyzed,
    skipped,
    failed,
  });
}
