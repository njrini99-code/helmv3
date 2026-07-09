/**
 * v3 genome nightly cron — GET/POST /api/cron/v3/genome-nightly
 *
 * Chunked: picks up to PLAYERS_PER_INVOCATION players ordered by the
 * oldest computed_at (NULL-first), runs the orchestrator for each,
 * returns a per-player summary. Self-balancing — next run naturally
 * grabs the now-stalest cohort.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 *
 * Schedule: configured in vercel.json (operational follow-up — kept
 * separate so the route can soak in preview).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { computeGenomeForPlayer } from '@/lib/coachhelm/v3/genome/orchestrator';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const PLAYERS_PER_INVOCATION = 25;

interface NightlySummary {
  players_in_chunk: number;
  per_player: Array<{
    player_id: string;
    dimensions_computed: number;
    dimensions_null: number;
    rounds_basis: number;
    errors: number;
  }>;
  duration_ms: number;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-genome-nightly', () => handle());
}

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  return recordJobRun('v3-genome-nightly', () => handle());
}

async function handle(): Promise<NextResponse> {
  const startedAt = Date.now();
  const supabase = createAdminClient();

  // Active team players, oldest-genome-first. NULL computed_at sorts
  // first so never-computed players catch up before everyone else.
  // Paginated: platform-wide, unfiltered fetch (both queries) can exceed the
  // PostgREST 1000-row cap once the roster grows (mirrors event-reminders'
  // use of fetchAllRowsResult). Ordering here only needs to be a STABLE
  // unique key for correct page boundaries — the actual "stalest first"
  // ordering is re-derived client-side below via computedAtByPlayer, so
  // ordering by the table's own primary key (player_id) is safe.
  const { data: existingGenomes } = await fetchAllRowsResult<{ player_id: string; computed_at: string }>(
    (from, to) =>
      supabase
        .from('golf_player_genome')
        .select('player_id, computed_at')
        .order('player_id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_player_genome', action: 'cron.v3.genome-nightly', sport: 'golf' },
  );
  const computedAtByPlayer = new Map<string, string>();
  for (const g of existingGenomes ?? []) {
    computedAtByPlayer.set(g.player_id, g.computed_at);
  }

  const { data: members } = await fetchAllRowsResult<{ player_id: string }>(
    (from, to) =>
      supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_team_members', action: 'cron.v3.genome-nightly', sport: 'golf' },
  );
  const allPlayerIds = Array.from(new Set((members ?? []).map((m) => m.player_id)));

  // Sort: never-computed (no entry in map) come first, then by ascending
  // computed_at. Take the first PLAYERS_PER_INVOCATION.
  allPlayerIds.sort((a, b) => {
    const ca = computedAtByPlayer.get(a);
    const cb = computedAtByPlayer.get(b);
    if (!ca && !cb) return 0;
    if (!ca) return -1;
    if (!cb) return 1;
    return ca.localeCompare(cb);
  });
  const chunk = allPlayerIds.slice(0, PLAYERS_PER_INVOCATION);

  const per_player: NightlySummary['per_player'] = [];
  for (const pid of chunk) {
    try {
      const r = await computeGenomeForPlayer(pid);
      per_player.push({
        player_id: pid,
        dimensions_computed: r.dimensions_computed,
        dimensions_null: r.dimensions_null,
        rounds_basis: r.rounds_basis,
        errors: r.errors,
      });
    } catch (err) {
      await logServerError(
        `genome-nightly compute exception for ${pid}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.v3.genome-nightly' },
      );
      per_player.push({
        player_id: pid,
        dimensions_computed: 0,
        dimensions_null: 0,
        rounds_basis: 0,
        errors: 1,
      });
    }
  }

  return NextResponse.json({
    players_in_chunk: chunk.length,
    per_player,
    duration_ms: Date.now() - startedAt,
  } satisfies NightlySummary);
}
