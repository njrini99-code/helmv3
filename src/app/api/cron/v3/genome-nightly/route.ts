/**
 * v3 genome nightly cron — GET/POST /api/cron/v3/genome-nightly
 *
 * Chunked: picks up to PLAYERS_PER_INVOCATION players who can actually
 * produce a vector — at least one completed round inside the orchestrator's
 * window — ordered never-computed first, then oldest computed_at. Runs the
 * orchestrator for each and returns a per-player summary.
 *
 * "Self-balancing — next run naturally grabs the now-stalest cohort" is what
 * this header used to claim, and it was false for six weeks. Rotation depends
 * on every selected player coming back with a `computed_at`, and a player the
 * orchestrator SKIPS never gets one, so it sorted to the front again the next
 * night. 25 permanently-uncomputable players against a 25-slot chunk meant the
 * queue never moved: 47 consecutive `completed` runs at ~1s each while
 * `golf_player_genome` sat frozen at 2026-07-07. The eligibility filter below
 * is what makes the claim true; see `select-refresh-chunk.ts`.
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
import { computeGenomeForPlayer, WINDOW_DAYS as GENOME_WINDOW_DAYS } from '@/lib/coachhelm/v3/genome/orchestrator';
import { selectGenomeRefreshChunk } from '@/lib/coachhelm/v3/genome/select-refresh-chunk';
import { recordJobRun } from '@/lib/admin/job-log';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { describeError } from '@/lib/utils/describe-error';

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
  const { data: existingGenomes, error: genomesErr } = await fetchAllRowsResult<{ player_id: string; computed_at: string }>(
    (from, to) =>
      supabase
        .from('golf_player_genome')
        .select('player_id, computed_at')
        .order('player_id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_player_genome', action: 'cron.v3.genome-nightly', sport: 'golf' },
  );
  if (genomesErr) {
    // Not logged here: this route is wrapped in recordJobRun (job-log.ts),
    // which already writes a "Cron failed" Bridge event for any >=400
    // response — logging again here would double-write error_logs/
    // admin_events/Sentry for the same failure.
    return NextResponse.json({ success: false, error: genomesErr.message }, { status: 500 });
  }
  const computedAtByPlayer = new Map<string, string>();
  for (const g of existingGenomes ?? []) {
    computedAtByPlayer.set(g.player_id, g.computed_at);
  }

  const { data: members, error: membersErr } = await fetchAllRowsResult<{ player_id: string }>(
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
  if (membersErr) {
    // Not logged here: this route is wrapped in recordJobRun (job-log.ts),
    // which already writes a "Cron failed" Bridge event for any >=400
    // response — logging again here would double-write error_logs/
    // admin_events/Sentry for the same failure.
    return NextResponse.json({ success: false, error: membersErr.message }, { status: 500 });
  }
  const allPlayerIds = Array.from(new Set((members ?? []).map((m) => m.player_id)));

  // Who can actually produce a vector tonight. A player with no completed round
  // inside the orchestrator's window yields zero valid dimensions, and
  // `computeGenomeForPlayer` then refuses to upsert (all-null vectors are the
  // trust-eroding state P2-21 forbids) — so it writes nothing, keeps no
  // `computed_at`, and sorts to the front of the queue again tomorrow.
  //
  // In production that starved the job completely: 25 of the 32 never-computed
  // players had no rounds in the window, PLAYERS_PER_INVOCATION is 25, so the
  // same guaranteed-skip cohort filled every chunk. 47 consecutive `completed`
  // runs, ~1s each, and `golf_player_genome` frozen at 2026-07-07 for 41 days.
  // The Genome surface has been showing July analysis ever since.
  const windowStart = new Date(Date.now() - GENOME_WINDOW_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);
  const { data: eligibleRows, error: eligibleErr } = await fetchAllRowsResult<{ player_id: string }>(
    (from, to) =>
      supabase
        .from('golf_rounds')
        .select('player_id')
        .eq('status', 'completed')
        .gte('round_date', windowStart)
        .order('id', { ascending: true })
        .range(from, to),
    undefined,
    { table: 'golf_rounds', action: 'cron.v3.genome-nightly', sport: 'golf' },
  );
  if (eligibleErr) {
    // Same reasoning as the two guards above: recordJobRun already writes the
    // Bridge event for a >=400 response. Failing loudly is right — silently
    // treating "eligibility unknown" as "nobody is eligible" would reproduce
    // the exact no-op-but-green failure this guard exists to end.
    return NextResponse.json({ success: false, error: eligibleErr.message }, { status: 500 });
  }
  const eligiblePlayerIds = new Set((eligibleRows ?? []).map((r) => r.player_id));

  const chunk = selectGenomeRefreshChunk(
    allPlayerIds,
    computedAtByPlayer,
    eligiblePlayerIds,
    PLAYERS_PER_INVOCATION,
  );

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
        `genome-nightly compute exception for ${pid}: ${describeError(err)}`,
        { action: 'cron.v3.genome-nightly', source: 'cron' },
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
