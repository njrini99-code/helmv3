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
 * Runs FIRST in the nightly chain (02:00). Everything downstream —
 * standing-refresh, genome, causality, goal-suggestions, calibration,
 * lifecycle — depends on the insight state this sweep produces, so it must
 * complete before any of them. See scripts/coachhelm-refresh-all.sh for the
 * canonical order.
 *
 * Who runs: every player whose most recent completed round is unanalyzed
 * (always) and, behind `coachhelm_reads_v1_copy` (CoachHelm Slice 0b), every
 * player whose newest countable round is newer than their newest visible
 * read — oldest first, at most MAX_FRESHNESS_REFRESHES_PER_RUN a night.
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
// Side-effect-only: guarantees insights.ts's module-scope registration
// (__registerTriggerPlayerInsightsAfterRound) has run at module-init time —
// the bridge no longer lazily imports insights.ts itself (that dynamic
// back-edge was the cold-start TDZ cycle; see trigger-insights-bridge.ts).
import '@/app/golf/actions/insights-coachhelm';
import { triggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';
import { isAnalysisOutcomeCode, kindForCode, type AnalysisOutcomeKind } from '@/lib/coachhelm/v3/engine/analysis-outcome';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { describeError } from '@/lib/utils/describe-error';
import { isCountableRound } from '@/lib/golf/round-countable';
import { VISIBLE_LIFECYCLE_STATES } from '@/lib/coachhelm/v3/insight-visibility';
import { freshnessReadsEnabled } from '@/lib/coachhelm/v3/engine/read-floors';
import {
  newestReadDay,
  planFreshnessRefreshes,
  readsBehindNewestRound,
  type SweepRead,
  type SweepRound,
} from '@/lib/coachhelm/v3/engine/sweep-freshness';

const isFailureKind = (kind: AnalysisOutcomeKind): boolean =>
  kind === 'retryable_failure' || kind === 'permanent_failure';

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
  // Engine opted out for other reasons (team disabled, no coach, no
  // completed rounds at all, etc.) — not an error.
  let skipped = 0;
  let failed = 0;
  // Slice 0b (flag `coachhelm_reads_v1_copy`): players re-analyzed because
  // their newest countable round is newer than their newest read.
  let freshnessRefreshed = 0;
  const freshnessOn = freshnessReadsEnabled();

  // Phase 1: decide per player (cheap reads only), in small batches.
  const decisions: SweepDecision[] = [];
  for (let i = 0; i < uniquePlayerIds.length; i += CONCURRENCY) {
    const batch = uniquePlayerIds.slice(i, i + CONCURRENCY);
    decisions.push(
      ...(await Promise.all(batch.map((playerId) => decideSweep(supabase, playerId, freshnessOn)))),
    );
  }

  // Phase 2: run every unanalyzed-latest-round player (as before) and the
  // freshness refreshes, most out-of-date first, up to the nightly cap (the
  // rest wait for the next night). The engine run is the deterministic
  // generators + composites only (`analyzePlayer`); no LLM composer is on
  // this path.
  const plan = planFreshnessRefreshes(
    decisions.filter((d): d is FreshnessDecision => d.kind === 'freshness'),
  );
  const freshnessDeferred = plan.deferred.length;
  // Player's MOST RECENT completed round already had coachhelm_analyzed_at
  // set and nothing newer needs a refresh (or it waits for tomorrow's cap).
  const alreadyAnalyzedSkipped =
    decisions.filter((d) => d.kind === 'already_analyzed').length + freshnessDeferred;
  const toRun: Array<{ playerId: string; freshness: boolean }> = [
    ...decisions.filter((d) => d.kind === 'legacy').map((d) => ({ playerId: d.playerId, freshness: false })),
    ...plan.run.map((d) => ({ playerId: d.playerId, freshness: true })),
  ];

  for (let i = 0; i < toRun.length; i += CONCURRENCY) {
    const batch = toRun.slice(i, i + CONCURRENCY);
    const pairs = await Promise.all(
      batch.map(async ({ playerId, freshness }) => {
        try {
          const result = await triggerPlayerInsightsAfterRound(playerId);
          return { playerId, freshness, ok: true as const, result };
        } catch (err) {
          return { playerId, freshness, ok: false as const, err };
        }
      }),
    );
    for (const p of pairs) {
      if (!p.ok) {
        failed++;
        await logServerError(
          `cron.rosterSweep.trigger rejected: ${describeError(p.err)}`,
          {
            action: 'cron.coachhelm.rosterSweep.trigger',
            featureArea: 'coachhelm',
            extra: { playerId: p.playerId },
          },
          'warning',
        );
        continue;
      }
      if (p.freshness) freshnessRefreshed++;
      if (p.result.success) {
        analyzed++;
      } else if (isAnalysisOutcomeCode(p.result.code) && isFailureKind(kindForCode(p.result.code))) {
        // R3: the engine names its own state. A transient or permanent
        // failure is a failure here too — it used to be folded into
        // `skipped` with the expected states and vanish from the count.
        failed++;
      } else {
        // Engine parked the player (team disabled, no coach, under the round
        // floor, nothing in the window) — an expected state, not an error.
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
    freshnessRefreshed,
    freshnessDeferred,
  });
}

type FreshnessDecision = { playerId: string; kind: 'freshness'; newestReadDay: string | null };
type SweepDecision =
  | { playerId: string; kind: 'legacy' }
  | { playerId: string; kind: 'already_analyzed' }
  | FreshnessDecision;

/**
 * One player's sweep decision.
 *
 * Legacy rule (2026-07-17, closes #920 — always on): run the engine when the
 * player's MOST RECENT completed round has no coachhelm_analyzed_at — not
 * "any round analyzed within the last 12h" (the old SKIP_IF_ANALYZED_WITHIN_MS
 * window let a fresh, unanalyzed latest round be skipped because an EARLIER
 * round was re-analyzed inside the same 12h). Fails open on a lookup error:
 * a transient error must not silently skip a player forever.
 *
 * Slice 0b rule (flag on): an analyzed player is still refreshed when their
 * newest countable round is newer than their newest visible read
 * (`readsBehindNewestRound`). A lookup error there means "no refresh": the
 * legacy rule already covers new data, so this one never fails open.
 */
async function decideSweep(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
  freshnessOn: boolean,
): Promise<SweepDecision> {
  try {
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
      await logServerError(
        `cron.rosterSweep.latestRound failed: ${latestRoundError.message}`,
        {
          action: 'cron.coachhelm.rosterSweep.latestRound',
          featureArea: 'coachhelm',
          extra: { playerId, code: latestRoundError.code },
        },
        'warning',
      );
      return { playerId, kind: 'legacy' };
    }
    if (!latestRound?.coachhelm_analyzed_at) return { playerId, kind: 'legacy' };
    if (!freshnessOn) return { playerId, kind: 'already_analyzed' };

    const freshness = await loadFreshnessInputs(supabase, playerId);
    if (freshness && readsBehindNewestRound(freshness.newest, freshness.reads)) {
      return { playerId, kind: 'freshness', newestReadDay: newestReadDay(freshness.reads) };
    }
    return { playerId, kind: 'already_analyzed' };
  } catch (err) {
    await logServerError(
      `cron.rosterSweep.decide failed: ${describeError(err)}`,
      { action: 'cron.coachhelm.rosterSweep.decide', featureArea: 'coachhelm', extra: { playerId } },
      'warning',
    );
    // Same fail-open as the legacy lookup: never silently skip a player.
    return { playerId, kind: 'legacy' };
  }
}

/** Rows read to find the newest countable round (non-countable ones skipped). */
const NEWEST_ROUND_LOOKBACK = 10;

/**
 * The player's newest countable round and their visible v3 reads' window
 * stamps. Null on any lookup error (the caller then does not refresh).
 */
async function loadFreshnessInputs(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
): Promise<{ newest: SweepRound | null; reads: SweepRead[] } | null> {
  const { data: rounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('id, round_date, created_at, is_test, holes_played, total_score, front_nine, back_nine, total_putts')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .eq('is_test', false)
    .order('round_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(NEWEST_ROUND_LOOKBACK);
  if (roundsError) return null;
  const newest = (rounds ?? []).find((r) => isCountableRound(r)) ?? null;

  const { data: insights, error: insightsError } = await supabase
    .from('golf_coach_insights')
    .select('evidence')
    .eq('player_id', playerId)
    .eq('engine_version', 'v3')
    .in('lifecycle_state', [...VISIBLE_LIFECYCLE_STATES])
    .neq('status', 'dismissed');
  if (insightsError) return null;
  const reads: SweepRead[] = (insights ?? []).map((row) => {
    const ev = (row.evidence ?? {}) as { window_end?: unknown; newest_round_id?: unknown };
    return {
      window_end: typeof ev.window_end === 'string' ? ev.window_end : null,
      newest_round_id: typeof ev.newest_round_id === 'string' ? ev.newest_round_id : null,
    };
  });
  return { newest: newest ? { id: newest.id, round_date: newest.round_date } : null, reads };
}
