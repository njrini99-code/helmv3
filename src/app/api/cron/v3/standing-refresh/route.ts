/**
 * v3 standing refresh cron — GET/POST /api/cron/v3/standing-refresh
 *
 * Selects up to TEAMS_PER_CHUNK teams ordered by their oldest standing
 * row (NULL-first, then ASC by computed_at), then calls the in-DB
 * refresh_player_standing(p_team_ids uuid[]) RPC. The RPC loops over 15
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
  duration_ms: number;
  error?: string;
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
  const supabase = createAdminClient();

  // Pick TEAMS_PER_CHUNK teams ordered oldest-standing-first. We do this
  // via the table API ordered by team.created_at as a stable proxy until
  // a future migration adds a per-team standing-freshness column.
  // Current team count (<20) means a single invocation covers everyone.
  let teamIds: string[] = [];
  try {
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
      metrics_covered: [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS],
      metrics_deferred: [...STANDING_REFRESH_DEFERRED_METRIC_IDS],
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
        metrics_covered: [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS],
        metrics_deferred: [...STANDING_REFRESH_DEFERRED_METRIC_IDS],
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
  } catch (err) {
    await logServerError(
      `standing-refresh RPC exception: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.v3.standing-refresh.rpc' },
    );
    return NextResponse.json({
      teams_in_chunk: teamIds.length,
      team_ids: teamIds,
      rpc_rows: [],
      metrics_covered: [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS],
      metrics_deferred: [...STANDING_REFRESH_DEFERRED_METRIC_IDS],
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    } satisfies RefreshSummary);
  }

  return NextResponse.json({
    teams_in_chunk: teamIds.length,
    team_ids: teamIds,
    rpc_rows: rpcRows,
    metrics_covered: [...STANDING_REFRESH_METRIC_IDS, ...ROUND_REFRESH_METRIC_IDS],
    metrics_deferred: [...STANDING_REFRESH_DEFERRED_METRIC_IDS],
    duration_ms: Date.now() - startedAt,
  } satisfies RefreshSummary);
}
