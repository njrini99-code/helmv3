/**
 * v3 W12 — standing backfill (one-shot, chunked)
 *
 * Iterates over EVERY team in the database, chunking into TEAMS_PER_CHUNK
 * batches and calling the refresh_player_standing(uuid[]) RPC for each.
 * Designed to be triggered once after deploy to populate
 * golf_player_standing from scratch; subsequent freshness is handled by
 * the nightly /api/cron/v3/standing-refresh route (W11).
 *
 * Safe to re-run: the RPC uses INSERT ON CONFLICT DO UPDATE, so a repeat
 * invocation just refreshes computed_at without changing the row count.
 *
 * Auth: same Vercel-cron pattern as the nightly route — Bearer CRON_SECRET.
 * Operator triggers manually after deploy:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://helmsportslabs.com/api/cron/v3/standing-backfill
 *
 * NOT scheduled in vercel.json — this is a one-shot, not a recurring cron.
 *
 * Per master plan Part XXI Backfill Strategy: schema migration ships
 * first, verified empty; backfill ships in a separate PR, verified
 * populated. W11 carried the schema + the recurring cron; W12 ships the
 * one-shot.
 *
 * Note: the W11 verification invocation against all teams already
 * populated 171 rows in prod, so this route is partially belt-and-
 * suspenders. The artifact still ships per the master plan and gives
 * operators a documented way to re-trigger a full refresh if needed.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import {
  STANDING_REFRESH_METRIC_IDS,
  TEAMS_PER_CHUNK,
} from '@/lib/coachhelm/v3/standing/refresh';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface BackfillSummary {
  total_teams_processed: number;
  chunks_processed: number;
  rows_upserted_by_metric: Record<string, number>;
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

  // 1. Select every team. Sorted for stable chunking on retry.
  let teamIds: string[] = [];
  try {
    const { data, error } = await supabase
      .from('golf_teams')
      .select('id')
      .order('created_at', { ascending: true });

    if (error) {
      await logServerError(`standing-backfill team-select: ${error.message}`, {
        action: 'cron.v3.standing-backfill.team-select',
      });
      return NextResponse.json(
        { error: 'team-select failed', duration_ms: Date.now() - startedAt },
        { status: 500 },
      );
    }
    teamIds = (data ?? []).map((t) => t.id);
  } catch (err) {
    await logServerError(
      `standing-backfill team-select exception: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.v3.standing-backfill.team-select' },
    );
    return NextResponse.json(
      { error: 'team-select exception', duration_ms: Date.now() - startedAt },
      { status: 500 },
    );
  }

  // 2. Chunk + invoke RPC per chunk. Tally rows upserted per metric.
  const rowsByMetric: Record<string, number> = {};
  for (const m of STANDING_REFRESH_METRIC_IDS) rowsByMetric[m] = 0;

  let chunksProcessed = 0;
  for (let i = 0; i < teamIds.length; i += TEAMS_PER_CHUNK) {
    const chunk = teamIds.slice(i, i + TEAMS_PER_CHUNK);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('refresh_player_standing', {
        p_team_ids: chunk,
      });
      if (error) {
        await logServerError(
          `standing-backfill RPC chunk ${chunksProcessed}: ${error.message ?? 'unknown'}`,
          { action: 'cron.v3.standing-backfill.rpc' },
        );
        return NextResponse.json({
          total_teams_processed: chunksProcessed * TEAMS_PER_CHUNK,
          chunks_processed: chunksProcessed,
          rows_upserted_by_metric: rowsByMetric,
          duration_ms: Date.now() - startedAt,
          error: error.message ?? 'rpc-error',
        } satisfies BackfillSummary);
      }
      for (const row of (data ?? []) as Array<{ metric_id: string; rows_upserted: number }>) {
        rowsByMetric[row.metric_id] =
          (rowsByMetric[row.metric_id] ?? 0) + (row.rows_upserted ?? 0);
      }
    } catch (err) {
      await logServerError(
        `standing-backfill RPC chunk ${chunksProcessed} exception: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.v3.standing-backfill.rpc' },
      );
      return NextResponse.json({
        total_teams_processed: chunksProcessed * TEAMS_PER_CHUNK,
        chunks_processed: chunksProcessed,
        rows_upserted_by_metric: rowsByMetric,
        duration_ms: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      } satisfies BackfillSummary);
    }
    chunksProcessed += 1;
  }

  return NextResponse.json({
    total_teams_processed: teamIds.length,
    chunks_processed: chunksProcessed,
    rows_upserted_by_metric: rowsByMetric,
    duration_ms: Date.now() - startedAt,
  } satisfies BackfillSummary);
}
