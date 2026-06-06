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
  duration_ms: number;
  error?: string;
}

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
      duration_ms: Date.now() - startedAt,
    } satisfies RefreshSummary);
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
    duration_ms: Date.now() - startedAt,
  } satisfies RefreshSummary);
}
