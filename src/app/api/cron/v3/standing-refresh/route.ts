/**
 * v3 standing refresh cron — GET/POST /api/cron/v3/standing-refresh
 *
 * Selects up to TEAMS_PER_CHUNK teams ordered by their REAL standing
 * freshness (oldest active-player computed_at, NULLS FIRST) via the
 * select_stalest_teams(p_limit) RPC, then calls the in-DB
 * refresh_player_standing(p_team_ids uuid[]) RPC. The RPC loops over the
 * metric bindings and upserts golf_player_standing rows for the chunk.
 *
 * Self-balancing chunking: each invocation processes the staleest 50
 * teams. The next invocation naturally picks the now-stalest 50, so the
 * roster catches up over a few runs without a state cursor.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 *
 * Schedule: configured in vercel.json (operational follow-up — kept out
 * of W11 so the route can soak in preview before going live).
 *
 * Backfill: W12 ships the one-shot.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { runGoalProgressForPlayers } from '@/app/golf/actions/v3/goal-progress';
import { runFocusAreaProgressForPlayers } from '@/app/golf/actions/v3/focus-area-progress';
import {
  STANDING_REFRESH_METRIC_IDS,
  STANDING_REFRESH_DEFERRED_METRIC_IDS,
  ROUND_REFRESH_METRIC_IDS,
  SHOT_REFRESH_METRIC_IDS,
  TEAMS_PER_CHUNK,
} from '@/lib/coachhelm/v3/standing/refresh';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface RefreshSummary {
  teams_in_chunk: number;
  team_ids: string[];
  rpc_rows: Array<{ metric_id: string; rows_upserted: number }>;
  metrics_covered: string[];
  metrics_deferred: string[];
  // SC2 assertion: metrics declared covered that upserted 0 rows across the
  // whole chunk. A non-empty list means a "covered" metric is silently dead
  // (e.g. its cache column is NULL) and should be deferred — surfaced so the
  // drift is loud, not silent.
  metrics_covered_zero_rows: string[];
  // SC1: stale/orphan standing rows removed for the refreshed teams' players.
  orphans_pruned: number;
  // P1-07: active goals whose progress (current_value / snapshot / outcome)
  // advanced now that this chunk's standings are fresh. Optional so the early
  // returns (which run before the goal pass) need not set it.
  goals_progressed?: number;
  // Active focus areas whose current_value advanced this pass (windowed against
  // rounds since each area started). Optional, same reason as goals_progressed.
  focus_areas_progressed?: number;
  // W7 pre-sweep: player caches fully refreshed BEFORE the standing RPCs
  // (is_stale flag or recent completed-round activity), so standing never
  // ranks players on stale shot-derived columns.
  stale_caches_refreshed: number;
  duration_ms: number;
  error?: string;
}

// W7 pre-sweep bounds: recent-activity lookback must exceed the cron cadence
// (24h) so a lost after() callback is caught by the next nightly run; the
// refresh cap keeps the sweep inside maxDuration on pathological backlogs.
const RECENT_ACTIVITY_HOURS = 26;
const MAX_PRESWEEP_REFRESHES = 200;

/**
 * SC2 assertion — flag any metric the cron declared "covered" that upserted 0
 * rows across every team in the chunk. With teams present, a covered cache- or
 * round-backed metric producing 0 rows is a silent-dead binding (NULL cache
 * column, missing benchmark, etc.). Returns the offending metric ids.
 */
function coveredMetricsWithZeroRows(
  covered: readonly string[],
  rpcRows: ReadonlyArray<{ metric_id: string; rows_upserted: number }>,
): string[] {
  const totals = new Map<string, number>();
  for (const r of rpcRows) {
    totals.set(r.metric_id, (totals.get(r.metric_id) ?? 0) + (r.rows_upserted ?? 0));
  }
  return covered.filter((m) => (totals.get(m) ?? 0) === 0);
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return handle();
}

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return handle();
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  // Cutoff for the SC1 orphan prune: captured BEFORE the refresh RPCs so any
  // standing row for a refreshed team's player whose computed_at predates this
  // is one the run didn't re-write (player no longer qualifies) → orphan.
  const cutoff = new Date().toISOString();
  const supabase = createAdminClient();

  // Pick TEAMS_PER_CHUNK teams ordered by REAL standing freshness (oldest active-
  // player computed_at, NULLS FIRST) via select_stalest_teams. This is the self-
  // balancing "stalest N" selection the cron always promised — created_at ASC
  // (the old proxy) starved every team past the first-created N (PERF-2). Falls
  // back to created_at ASC if the RPC isn't deployed yet.
  let teamIds: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stalest = await (supabase as any).rpc('select_stalest_teams', {
      p_limit: TEAMS_PER_CHUNK,
    });
    if (!stalest.error && Array.isArray(stalest.data)) {
      teamIds = (stalest.data as Array<{ team_id: string }>).map((t) => t.team_id);
    } else {
      if (stalest.error) {
        await logServerError(
          `standing-refresh stalest-teams fallback: ${stalest.error.message ?? 'unknown'}`,
          { action: 'cron.v3.standing-refresh.team-select' },
        );
      }
      const { data, error } = await supabase
        .from('golf_teams')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(TEAMS_PER_CHUNK);

      if (error) {
        await logServerError(`standing-refresh team-select: ${error.message}`, {
          action: 'cron.v3.standing-refresh.team-select',
        });
        return NextResponse.json(
          { error: 'team-select failed', duration_ms: Date.now() - startedAt },
          { status: 500 },
        );
      }
      teamIds = (data ?? []).map((t) => t.id);
    }
  } catch (err) {
    await logServerError(
      `standing-refresh team-select exception: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.v3.standing-refresh.team-select' },
    );
    return NextResponse.json(
      { error: 'team-select exception', duration_ms: Date.now() - startedAt },
      { status: 500 },
    );
  }

  if (teamIds.length === 0) {
    return NextResponse.json({
      teams_in_chunk: 0,
      team_ids: [],
      rpc_rows: [],
      metrics_covered: [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS, ...SHOT_REFRESH_METRIC_IDS],
      metrics_deferred: [...STANDING_REFRESH_DEFERRED_METRIC_IDS],
      metrics_covered_zero_rows: [],
      orphans_pruned: 0,
      stale_caches_refreshed: 0,
      duration_ms: Date.now() - startedAt,
    } satisfies RefreshSummary);
  }

  // W7 pre-sweep (stats audit 2026-06-09): the shot-derived cache columns
  // (putt bands + attempts, approach proximity, miss bias, putts_per_gir,
  // driving distance, first_round_date) are written ONLY by
  // refresh_player_stats_cache, which normally runs in the after() callback of
  // a round submit/edit. If that callback dies, the trigger path has already
  // set is_stale=false, so nothing self-heals and the standing RPCs below
  // would rank players on stale band values indefinitely. Refresh, bounded:
  // chunk players flagged stale + any with completed-round activity inside the
  // lookback window. Failure-isolated — standing still runs on a sweep error.
  let staleCachesRefreshed = 0;
  try {
    const { data: memberRows } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .in('team_id', teamIds)
      .eq('status', 'active')
      .limit(1000);
    const chunkPlayerIds = [...new Set((memberRows ?? []).map((m) => m.player_id as string))];
    if (chunkPlayerIds.length > 0) {
      const recentCutoff = new Date(Date.now() - RECENT_ACTIVITY_HOURS * 3_600_000).toISOString();
      const [staleRes, recentRes] = await Promise.all([
        supabase
          .from('golf_player_stats_cache')
          .select('player_id')
          .in('player_id', chunkPlayerIds)
          .eq('is_stale', true)
          .limit(MAX_PRESWEEP_REFRESHES),
        supabase
          .from('golf_rounds')
          .select('player_id')
          .in('player_id', chunkPlayerIds)
          .eq('status', 'completed')
          .gte('updated_at', recentCutoff)
          .limit(1000),
      ]);
      const toRefresh = [
        ...new Set([
          ...(staleRes.data ?? []).map((r) => r.player_id as string),
          ...(recentRes.data ?? []).map((r) => r.player_id as string),
        ]),
      ].slice(0, MAX_PRESWEEP_REFRESHES);
      for (const pid of toRefresh) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: refreshErr } = await (supabase as any).rpc('refresh_player_stats_cache', {
          p_player_id: pid,
        });
        if (refreshErr) {
          await logServerError(
            `standing-refresh cache-presweep refresh: ${refreshErr.message ?? 'unknown'}`,
            { action: 'cron.v3.standing-refresh.cache-presweep', playerId: pid },
          );
        } else {
          staleCachesRefreshed++;
        }
      }
    }
  } catch (err) {
    await logServerError(
      `standing-refresh cache-presweep exception: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.v3.standing-refresh.cache-presweep' },
    );
  }

  // Call the SECURITY DEFINER RPC. The function lives in
  // supabase/migrations/20260524210100_v3_refresh_player_standing_function.sql
  // and owns the per-metric upsert SQL.
  type RpcRow = { metric_id: string; rows_upserted: number };
  let rpcRows: RpcRow[] = [];

  try {
    // refresh_player_standing isn't in the generated Database types
    // (function created in this PR's migration). Use the untyped escape
    // hatch via an explicit cast — RPC names are runtime-resolved by
    // postgres-meta, so this is safe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcResult = await (supabase as any).rpc('refresh_player_standing', {
      p_team_ids: teamIds,
    });
    if (rpcResult.error) {
      await logServerError(
        `standing-refresh RPC: ${rpcResult.error.message ?? 'unknown'}`,
        { action: 'cron.v3.standing-refresh.rpc' },
      );
      return NextResponse.json({
        teams_in_chunk: teamIds.length,
        team_ids: teamIds,
        rpc_rows: [],
        metrics_covered: [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS, ...SHOT_REFRESH_METRIC_IDS],
        metrics_deferred: [...STANDING_REFRESH_DEFERRED_METRIC_IDS],
        metrics_covered_zero_rows: [],
        orphans_pruned: 0,
        stale_caches_refreshed: staleCachesRefreshed,
        duration_ms: Date.now() - startedAt,
        error: rpcResult.error.message ?? 'rpc-error',
      } satisfies RefreshSummary);
    }
    rpcRows = (rpcResult.data ?? []) as RpcRow[];

    // Companion RPC for round-level metrics (practice_tournament_delta +
    // opening_hole_delta). Different table/output shape — normalized below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roundResult = await (supabase as any).rpc('refresh_player_standing_round_metrics', {
      p_team_ids: teamIds,
    });
    if (roundResult.error) {
      await logServerError(
        `standing-refresh round-RPC: ${roundResult.error.message ?? 'unknown'}`,
        { action: 'cron.v3.standing-refresh.round-rpc' },
      );
      // Don't fail the whole refresh — cache metrics succeeded.
    } else {
      const roundRows = (roundResult.data ?? []) as Array<{ out_metric_id: string; out_rows_upserted: number }>;
      for (const r of roundRows) {
        rpcRows.push({ metric_id: r.out_metric_id, rows_upserted: r.out_rows_upserted });
      }
    }

    // Companion RPC for shot-level metrics (approach proximity by band). Same
    // out_* shape as the round RPC. Failure-isolated — cache + round metrics
    // already succeeded, so a shot-metrics error must not fail the refresh.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shotResult = await (supabase as any).rpc('refresh_player_standing_shot_metrics', {
      p_team_ids: teamIds,
    });
    if (shotResult.error) {
      await logServerError(
        `standing-refresh shot-RPC: ${shotResult.error.message ?? 'unknown'}`,
        { action: 'cron.v3.standing-refresh.shot-rpc' },
      );
    } else {
      const shotRows = (shotResult.data ?? []) as Array<{ out_metric_id: string; out_rows_upserted: number }>;
      for (const r of shotRows) {
        rpcRows.push({ metric_id: r.out_metric_id, rows_upserted: r.out_rows_upserted });
      }
    }
  } catch (err) {
    await logServerError(
      `standing-refresh RPC exception: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.v3.standing-refresh.rpc' },
    );
    return NextResponse.json({
      teams_in_chunk: teamIds.length,
      team_ids: teamIds,
      rpc_rows: [],
      metrics_covered: [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS, ...SHOT_REFRESH_METRIC_IDS],
      metrics_deferred: [...STANDING_REFRESH_DEFERRED_METRIC_IDS],
      metrics_covered_zero_rows: [],
      orphans_pruned: 0,
      stale_caches_refreshed: staleCachesRefreshed,
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    } satisfies RefreshSummary);
  }

  // SC1: prune stale/orphan standing rows for the refreshed teams' players.
  // Only after the cache-metric RPC succeeded (the catch above returns early on
  // failure), so we never delete rows a failed run simply didn't reach. Scoped
  // to teamIds + the pre-refresh cutoff — non-destructive, failure-isolated.
  let orphansPruned = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pruneResult = await (supabase as any).rpc('prune_stale_player_standing', {
      p_team_ids: teamIds,
      p_cutoff: cutoff,
    });
    if (pruneResult.error) {
      await logServerError(
        `standing-refresh prune: ${pruneResult.error.message ?? 'unknown'}`,
        { action: 'cron.v3.standing-refresh.prune' },
      );
    } else if (typeof pruneResult.data === 'number') {
      orphansPruned = pruneResult.data;
    }
  } catch (err) {
    await logServerError(
      `standing-refresh prune exception: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.v3.standing-refresh.prune' },
    );
  }

  // P1-07 track-progress: now that this chunk's standings are fresh, advance
  // the chunk players' active goals (current_value / snapshot / terminal
  // outcome) so progress moves durably — a goal can be hit or lapse even if
  // nobody opens the app. Failure-isolated — never fails the standing refresh.
  let goalsProgressed = 0;
  let focusAreasProgressed = 0;
  try {
    const { data: goalMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .in('team_id', teamIds)
      .eq('status', 'active')
      .limit(1000);
    const goalPlayerIds = [...new Set((goalMembers ?? []).map((m) => m.player_id as string))];
    const summary = await runGoalProgressForPlayers(goalPlayerIds);
    goalsProgressed = summary.updated;
    // Same durable pass for focus areas: window each active area's metric over
    // the rounds played since it started so the development-plan bar advances
    // nightly even if nobody opens the app. Reuses the chunk's player set.
    const focusSummary = await runFocusAreaProgressForPlayers(goalPlayerIds);
    focusAreasProgressed = focusSummary.updated;
  } catch (err) {
    await logServerError(
      `standing-refresh goal-progress: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.v3.standing-refresh.goal-progress' },
    );
  }

  // SC2 assertion: surface any "covered" metric that upserted 0 rows across the
  // whole chunk — a silent-dead binding. Logged (warning) so the drift is loud.
  const coveredZeroRows = coveredMetricsWithZeroRows(
    [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS, ...SHOT_REFRESH_METRIC_IDS],
    rpcRows,
  );
  if (coveredZeroRows.length > 0) {
    await logServerError(
      `standing-refresh covered-metrics-zero-rows: ${coveredZeroRows.join(', ')}`,
      { action: 'cron.v3.standing-refresh.zero-rows-assertion' },
    );
  }

  return NextResponse.json({
    teams_in_chunk: teamIds.length,
    team_ids: teamIds,
    rpc_rows: rpcRows,
    metrics_covered: [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS, ...SHOT_REFRESH_METRIC_IDS],
    metrics_deferred: [...STANDING_REFRESH_DEFERRED_METRIC_IDS],
    metrics_covered_zero_rows: coveredZeroRows,
    orphans_pruned: orphansPruned,
    stale_caches_refreshed: staleCachesRefreshed,
    goals_progressed: goalsProgressed,
    focus_areas_progressed: focusAreasProgressed,
    duration_ms: Date.now() - startedAt,
  } satisfies RefreshSummary);
}
