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
 * read and whose engine has not run in FRESHNESS_COOLDOWN_DAYS — in a
 * nightly rotation, at most MAX_FRESHNESS_REFRESHES_PER_RUN a night, and no
 * new freshness batch after FRESHNESS_TIME_BUDGET_MS.
 *
 * Idle-player stale refresh (flag `coachhelm_stale_refresh_v1`, off; see
 * engine/stale-refresh.ts): an analyzed player whose newest analysis is
 * STALE_REFRESH_DAYS+ days old, who has an open read and a round inside the
 * engine's 90-day window, is re-analyzed anyway: at most STALE_REFRESH_CAP a
 * night, oldest first, after the freshness picks and under the same time
 * budget.
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
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { describeError } from '@/lib/utils/describe-error';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { freshnessReadsEnabled } from '@/lib/coachhelm/v3/engine/read-floors';
import { coachhelmTeamAllowlist, isCoachHelmFlagEnabled, runWithCoachHelmTeams } from '@/lib/coachhelm/canary';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { resolveEngineOwner } from '@/lib/coachhelm/engine-owner';
import {
  roundInsideEngineWindow,
  selectStaleRefreshPlayers,
  STALE_REFRESH_CAP,
  STALE_REFRESH_DAYS,
  STALE_REFRESH_FLAG,
  STALE_REFRESH_PARKED_LOG_TYPE,
  type StaleAnchorRow,
} from '@/lib/coachhelm/v3/engine/stale-refresh';
import { loadPlayerRoundIndex, newestCountableRound } from '@/lib/coachhelm/v3/engine/read-window';
import {
  FRESHNESS_COOLDOWN_DAYS,
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

/**
 * No new freshness batch starts after this much of the run (maxDuration is
 * 300 s); the rest are reported as deferred and wait for the next night.
 * Unanalyzed-latest-round players are not limited (unchanged behaviour).
 */
export const FRESHNESS_TIME_BUDGET_MS = 240_000;

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
  // Slice 0b (flag `coachhelm_reads_v1_copy`): players whose engine run
  // SUCCEEDED because their newest countable round was newer than their
  // newest read.
  let freshnessRefreshed = 0;
  // HELM_COACHHELM_TEAMS canary: with a team list, each player's decision
  // (and its flag read) runs in that player's team scope, from the roster
  // already loaded above. Unset: one global read, as before.
  const canary = coachhelmTeamAllowlist() !== null;
  const teamsByPlayer = new Map<string, string[]>();
  if (canary) {
    for (const m of memberships ?? []) {
      if (!m.player_id || !m.team_id) continue;
      teamsByPlayer.set(m.player_id, [...(teamsByPlayer.get(m.player_id) ?? []), m.team_id]);
    }
  }
  const freshnessOn = canary ? false : freshnessReadsEnabled();
  const staleOn = canary ? false : staleRefreshEnabled();
  const startedAt = Date.now();
  const decide = (playerId: string): Promise<SweepDecision> =>
    canary
      ? runWithCoachHelmTeams(teamsByPlayer.get(playerId) ?? [], () =>
          decideSweep(supabase, playerId, freshnessReadsEnabled(), staleRefreshEnabled(), startedAt),
        )
      : decideSweep(supabase, playerId, freshnessOn, staleOn, startedAt);

  // Phase 1: decide per player (cheap reads only), in small batches.
  const decisions: SweepDecision[] = [];
  for (let i = 0; i < uniquePlayerIds.length; i += CONCURRENCY) {
    const batch = uniquePlayerIds.slice(i, i + CONCURRENCY);
    decisions.push(...(await Promise.all(batch.map(decide))));
  }

  // Phase 2: run every unanalyzed-latest-round player (as before), then the
  // freshness refreshes in tonight's rotation up to the nightly cap (the rest
  // wait for another night). The engine run is the deterministic generators +
  // composites only (`analyzePlayer`); no LLM composer is on this path.
  const plan = planFreshnessRefreshes(
    decisions.filter((d): d is FreshnessDecision => d.kind === 'freshness'),
    Math.floor(startedAt / 86_400_000),
  );
  const freshnessCooldown = decisions.filter((d) => d.kind === 'freshness_cooldown').length;
  let freshnessDeferred = plan.deferred.length;

  // Idle-player stale refresh (flag off unless the owner turns it on): from
  // the analyzed players nothing else will run tonight, the oldest
  // STALE_REFRESH_CAP whose newest analysis is STALE_REFRESH_DAYS+ old.
  const staleCandidates = decisions
    .filter((d): d is AlreadyAnalyzedDecision => d.kind === 'already_analyzed' && d.staleEligible)
    .map((d) => d.playerId);
  // null: a lookup failed (logged), so no stale refresh tonight.
  const stalePicks = staleCandidates.length > 0
    ? (await pickStaleRefreshes(supabase, staleCandidates, startedAt)) ?? []
    : [];
  let staleRefreshed = 0;
  let staleDeferred = 0;
  // Stale picks whose run wrote nothing (parked, failed or threw): each gets
  // a STALE_REFRESH_PARKED_LOG_TYPE row so it counts toward the anchor and is
  // not picked again for STALE_REFRESH_DAYS.
  const staleUnproductive: string[] = [];

  const toRun: Array<{ playerId: string; mode: RunMode }> = [
    ...decisions.filter((d) => d.kind === 'legacy').map((d) => ({ playerId: d.playerId, mode: 'legacy' as const })),
    ...plan.run.map((d) => ({ playerId: d.playerId, mode: 'freshness' as const })),
    ...stalePicks.map((p) => ({ playerId: p.playerId, mode: 'stale' as const })),
  ];

  for (let i = 0; i < toRun.length; i += CONCURRENCY) {
    let batch = toRun.slice(i, i + CONCURRENCY);
    if (Date.now() - startedAt > FRESHNESS_TIME_BUDGET_MS) {
      // Out of refresh time: keep running unanalyzed rounds, defer the rest.
      freshnessDeferred += batch.filter((p) => p.mode === 'freshness').length;
      staleDeferred += batch.filter((p) => p.mode === 'stale').length;
      batch = batch.filter((p) => p.mode === 'legacy');
      if (batch.length === 0) continue;
    }
    const pairs = await Promise.all(
      batch.map(async ({ playerId, mode }) => {
        try {
          const result = await triggerPlayerInsightsAfterRound(playerId, { runTrigger: 'sweep' });
          return { playerId, mode, ok: true as const, result };
        } catch (err) {
          return { playerId, mode, ok: false as const, err };
        }
      }),
    );
    for (const p of pairs) {
      if (p.mode === 'stale' && !(p.ok && p.result.success)) staleUnproductive.push(p.playerId);
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
      if (p.result.success) {
        analyzed++;
        // Only a run that succeeded refreshed anything.
        if (p.mode === 'freshness') freshnessRefreshed++;
        if (p.mode === 'stale') staleRefreshed++;
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

  // Player's MOST RECENT completed round already had coachhelm_analyzed_at
  // set and nothing newer needs a refresh now (current, cooling down, or
  // waiting for another night).
  const alreadyAnalyzedSkipped =
    decisions.filter((d) => d.kind === 'already_analyzed').length
    - stalePicks.length
    + staleDeferred
    + freshnessCooldown
    + freshnessDeferred;

  const staleMarked = staleUnproductive.length > 0
    ? await recordUnproductiveStaleRuns(supabase, staleUnproductive)
    : 0;

  if (stalePicks.length > 0) {
    await logServerEvent(
      `cron.rosterSweep.staleRefresh: ${staleRefreshed} of ${stalePicks.length} idle players refreshed`,
      {
        action: 'cron.coachhelm.rosterSweep.staleRefresh',
        featureArea: 'coachhelm',
        extra: {
          candidates: staleCandidates.length,
          picked: stalePicks.length,
          refreshed: staleRefreshed,
          deferred: staleDeferred,
          unproductive: staleUnproductive.length,
          unproductiveMarked: staleMarked,
          cap: STALE_REFRESH_CAP,
          staleDays: STALE_REFRESH_DAYS,
          oldestDays: stalePicks[0]?.staleDays ?? null,
        },
      },
      'info',
    );
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
    freshnessCooldown,
    staleRefreshed,
    staleRefreshPicked: stalePicks.length,
    staleRefreshDeferred: staleDeferred,
  });
}

/** The idle-player stale refresh flag, read in the current canary team scope. */
function staleRefreshEnabled(): boolean {
  return isCoachHelmFlagEnabled(STALE_REFRESH_FLAG);
}

type RunMode = 'legacy' | 'freshness' | 'stale';
type FreshnessDecision = { playerId: string; kind: 'freshness' };
/** `staleEligible`: the stale flag is on for this player and they have a round inside the engine window. */
type AlreadyAnalyzedDecision = { playerId: string; kind: 'already_analyzed'; staleEligible: boolean };
type SweepDecision =
  | { playerId: string; kind: 'legacy' }
  | AlreadyAnalyzedDecision
  | { playerId: string; kind: 'freshness_cooldown' }
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
 * (`readsBehindNewestRound`), unless their engine ran inside the cooldown
 * (`FRESHNESS_COOLDOWN_DAYS`). A lookup error there means "no refresh": the
 * legacy rule already covers new data, so this one never fails open.
 */
async function decideSweep(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
  freshnessOn: boolean,
  staleOn: boolean,
  nowMs: number,
): Promise<SweepDecision> {
  try {
    const { data: latestRound, error: latestRoundError } = await supabase
      .from('golf_rounds')
      .select('coachhelm_analyzed_at, round_date')
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
    const analyzed: AlreadyAnalyzedDecision = {
      playerId,
      kind: 'already_analyzed',
      staleEligible: staleOn && roundInsideEngineWindow(latestRound.round_date, nowMs),
    };
    if (!freshnessOn) return analyzed;

    const freshness = await loadFreshnessInputs(supabase, playerId);
    if (!freshness || !readsBehindNewestRound(freshness.newest, freshness.reads)) {
      return analyzed;
    }
    const cooling = await engineRanRecently(supabase, playerId, nowMs);
    if (cooling !== false) return { playerId, kind: 'freshness_cooldown' };
    return { playerId, kind: 'freshness' };
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

/**
 * True when the player's engine wrote a run row (`post_round_v2`, written by
 * every engine run that reaches generation, including this sweep's) inside
 * the cooldown; null when the lookup failed (treated as cooling: freshness
 * never fails open).
 */
async function engineRanRecently(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
  nowMs: number,
): Promise<boolean | null> {
  const since = new Date(nowMs - FRESHNESS_COOLDOWN_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('golf_insight_generation_log')
    .select('id')
    .eq('player_id', playerId)
    .eq('insight_type', 'post_round_v2')
    .gte('created_at', since)
    .limit(1);
  if (error) return null;
  return Array.isArray(data) && data.length > 0;
}

/**
 * The player's newest countable round and their visible v3 reads' stamps.
 * The round comes from the same index, order and countable rule the stamp
 * uses (`loadPlayerRoundIndex`, `newestCountableRound`: completed, non-test,
 * every page, ties broken on id), so a run of newer non-countable rounds
 * cannot hide it and the sweep and the stamp cannot disagree about which
 * round is newest. Null on any lookup error (the caller then does not
 * refresh).
 */
async function loadFreshnessInputs(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
): Promise<{ newest: SweepRound | null; reads: SweepRead[] } | null> {
  const index = await loadPlayerRoundIndex(supabase, playerId);
  if (!index) return null;
  const newest = newestCountableRound(index);

  // The shared product-visibility contract (v3 by engine_version OR a v3:
  // signature, visible lifecycle, not dismissed): the reads a coach sees.
  const { data: insights, error: insightsError } = await applyInsightVisibility(
    supabase.from('golf_coach_insights').select('evidence').eq('player_id', playerId),
  );
  if (insightsError) return null;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const reads: SweepRead[] = (insights ?? []).map((row) => {
    const ev = (row.evidence ?? {}) as Record<string, unknown>;
    return {
      window_end: str(ev.window_end),
      newest_round_id: str(ev.newest_round_id),
      scanned_through_round_id: str(ev.scanned_through_round_id),
    };
  });
  return { newest: newest ? { id: newest.id, round_date: newest.round_date } : null, reads };
}

/**
 * The stale-refresh picks for tonight (see engine/stale-refresh.ts): reads
 * the candidates' visible reads and their engine runs inside the staleness
 * window, in id chunks. Null on any read error (logged): the caller then
 * runs no stale refresh tonight, since this pass is an extra.
 */
async function pickStaleRefreshes(
  supabase: ReturnType<typeof createAdminClient>,
  candidateIds: readonly string[],
  nowMs: number,
): Promise<ReturnType<typeof selectStaleRefreshPlayers> | null> {
  const since = new Date(nowMs - STALE_REFRESH_DAYS * 86_400_000).toISOString();
  const reads: StaleAnchorRow[] = [];
  const lastRunAt = new Map<string, number>();
  for (const chunk of chunkIds(candidateIds)) {
    const { data: rows, error: readsError } = await fetchAllRowsResult<StaleAnchorRow>((from, to) =>
      applyInsightVisibility(
        supabase.from('golf_coach_insights').select('player_id, created_at, metadata').in('player_id', chunk),
      )
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: StaleAnchorRow[] | null; error: { message: string; code?: string | null } | null }>,
    );
    const { data: runs, error: runsError } = readsError
      ? { data: null, error: null }
      : await fetchAllRowsResult<{ player_id: string | null; created_at: string | null }>((from, to) =>
          supabase
            .from('golf_insight_generation_log')
            .select('player_id, created_at')
            .in('insight_type', ['post_round_v2', STALE_REFRESH_PARKED_LOG_TYPE])
            .in('player_id', chunk)
            .gte('created_at', since)
            .order('id', { ascending: true })
            .range(from, to),
        );
    const error = readsError ?? runsError;
    if (error) {
      await logServerError(
        `cron.rosterSweep.staleRefresh lookup failed; no stale refresh tonight: ${error.message}`,
        {
          action: 'cron.coachhelm.rosterSweep.staleRefresh',
          featureArea: 'coachhelm',
          extra: { code: error.code ?? null, candidates: candidateIds.length },
        },
        'warning',
      );
      return null;
    }
    reads.push(...(rows ?? []));
    for (const run of runs ?? []) {
      const t = run.created_at ? Date.parse(run.created_at) : Number.NaN;
      if (!run.player_id || Number.isNaN(t)) continue;
      lastRunAt.set(run.player_id, Math.max(lastRunAt.get(run.player_id) ?? Number.NEGATIVE_INFINITY, t));
    }
  }
  // Every stale candidate, oldest first; then keep the first
  // STALE_REFRESH_CAP the engine would actually run. A player whose coach or
  // team has CoachHelm off (or with no coach) is skipped with the engine's
  // own park check, so they never take a slot.
  const ordered = selectStaleRefreshPlayers(candidateIds, reads, lastRunAt, nowMs, {
    cap: Number.POSITIVE_INFINITY,
  });
  const picks: ReturnType<typeof selectStaleRefreshPlayers> = [];
  for (const pick of ordered) {
    if (picks.length >= STALE_REFRESH_CAP) break;
    const owner = await resolveEngineOwner(supabase, pick.playerId);
    if (owner.kind === 'ok') picks.push(pick);
  }
  return picks;
}

/**
 * One STALE_REFRESH_PARKED_LOG_TYPE row per stale pick whose run wrote
 * nothing, so the pick counts toward the player's anchor. team_id stays null
 * and the admin BI read excludes the type: it is not an engine run. Returns
 * how many rows were written (0 on a write error, which is logged; the
 * player may then be picked again tomorrow).
 */
async function recordUnproductiveStaleRuns(
  supabase: ReturnType<typeof createAdminClient>,
  playerIds: readonly string[],
): Promise<number> {
  const { error } = await supabase.from('golf_insight_generation_log').insert(
    playerIds.map((playerId) => ({
      player_id: playerId,
      team_id: null,
      insight_type: STALE_REFRESH_PARKED_LOG_TYPE,
      insights_generated: 0,
      rounds_analyzed: 0,
      engine_version: 'v3',
    })),
  );
  if (error) {
    await logServerError(
      `cron.rosterSweep.staleRefresh marker write failed: ${error.message}`,
      { action: 'cron.coachhelm.rosterSweep.staleRefresh', featureArea: 'coachhelm', extra: { code: error.code ?? null } },
      'warning',
    );
    return 0;
  }
  return playerIds.length;
}
