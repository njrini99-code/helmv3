/**
 * Recompute Strokes Gained values in `golf_player_stats_cache` from raw shot data.
 *
 * Why: the SG values stored in `golf_player_stats_cache` are populated by the
 * SQL RPC `update_player_stats_strokes_gained`, which sums `golf_round_stats_cache`
 * rows that themselves come from `recalculate_round_strokes_gained`. Both SQL
 * functions produce inflated tee SG and depressed putting SG (e.g. Andrew Perry
 * 12 rounds: cached sg_tee_per_round=+6.48 — impossible for a 75-shooter).
 *
 * The TypeScript calculator at `src/lib/utils/golf-stats-calculator-shots.ts`
 * produces plausible per-round SG values when run against the same shot data
 * (Andrew Perry 12 rounds: tee=-0.17/r, app=-1.97/r, atg=+0.93/r, putt=-3.11/r).
 * This script recomputes SG using the TS calculator and overwrites the buggy
 * cache values.
 *
 * Algorithm:
 *   - For each player with a `golf_player_stats_cache` row:
 *     1. Fetch all completed rounds for the player
 *     2. Fetch all holes + shots for those rounds
 *     3. Run `calculateStatsFromShots` (TS calculator)
 *     4. Update the cache row's `strokes_gained_*` and `sg_*_per_round` fields
 *
 * Idempotent. Run as often as needed.
 *
 * Note: this script also clears stale per-round SG values in
 * `golf_round_stats_cache`. Otherwise the trigger
 * `trg_update_player_stats_complete` (which fires on `golf_rounds` /
 * `golf_round_stats_cache` writes) will re-overwrite our values by summing
 * the buggy round-cache rows on the next round write. We zero out the round
 * cache SG columns first, THEN write the player cache, so the player cache
 * values stick. The trigger updates player cache to NULL when it fires on
 * the round-cache clear, then we overwrite with our TS-computed values.
 *
 * The TS-derived values in `golf_player_stats_cache` stick until a new
 * round is added (at which point the SQL RPC will repopulate the round
 * cache with buggy values, and the trigger will aggregate them again —
 * that's the systemic SQL fix tracked separately).
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/recompute-sg-cache.ts
 *
 *   Pass --dry-run to log changes without writing.
 *   Pass --player=<uuid> to scope to a single player.
 *   Pass --no-clear-round-cache to skip clearing stale round-cache SG values.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  calculateStatsFromShots,
  type RawShot,
  type HoleInfo,
  type RoundInfo,
} from '../src/lib/utils/golf-stats-calculator-shots';

interface CacheRow {
  player_id: string;
  rounds_played: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
  sg_total_per_round: number | null;
  sg_tee_per_round: number | null;
  sg_approach_per_round: number | null;
  sg_around_green_per_round: number | null;
  sg_putting_per_round: number | null;
}

interface ComputedSg {
  total: number | null;
  tee: number | null;
  approach: number | null;
  aroundGreen: number | null;
  putting: number | null;
  totalPerRound: number | null;
  teePerRound: number | null;
  approachPerRound: number | null;
  aroundGreenPerRound: number | null;
  puttingPerRound: number | null;
}

function fmt(n: number | null): string {
  return n === null ? 'null' : n.toFixed(2);
}

async function recomputeForPlayer(
  supabase: SupabaseClient,
  playerId: string,
): Promise<ComputedSg | null> {
  // Fetch all completed rounds
  const { data: roundsData, error: roundsErr } = await supabase
    .from('golf_rounds')
    .select(
      'id, round_date, course_name, round_type, total_score, score_to_par, holes_played',
    )
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null);

  if (roundsErr) {
    console.warn(`[skip] ${playerId}: rounds query failed — ${roundsErr.message}`);
    return null;
  }
  const rounds = roundsData ?? [];
  if (rounds.length === 0) return null;

  const roundIds = rounds.map((r) => r.id as string);

  // Fetch holes
  const { data: holesData, error: holesErr } = await supabase
    .from('golf_holes')
    .select('id, round_id, hole_number, par, yardage, score, putts, fairway_hit, gir')
    .in('round_id', roundIds);
  if (holesErr) {
    console.warn(`[skip] ${playerId}: holes query failed — ${holesErr.message}`);
    return null;
  }

  // Fetch shots
  const { data: shotsData, error: shotsErr } = await supabase
    .from('golf_shots')
    .select(
      `id, round_id, hole_id, hole_number, shot_number, shot_type, club_type,
       lie_before, lie_after, distance_to_hole_before, distance_unit_before,
       distance_to_hole_after, distance_unit_after, result, shot_distance,
       miss_direction, putt_break, putt_distance_feet, putt_slope, putt_made,
       is_penalty, penalty_type`,
    )
    .in('round_id', roundIds)
    .order('hole_number')
    .order('shot_number');
  if (shotsErr) {
    console.warn(`[skip] ${playerId}: shots query failed — ${shotsErr.message}`);
    return null;
  }

  const roundsInfo: RoundInfo[] = rounds.map((r: any) => ({
    id: r.id,
    round_date: r.round_date,
    course_name: r.course_name ?? 'Unknown Course',
    round_type: r.round_type ?? null,
    holes_played: r.holes_played ?? null,
  }));

  const holesInfo: HoleInfo[] = (holesData ?? []).map((h: any) => ({
    id: h.id,
    round_id: h.round_id,
    hole_number: h.hole_number,
    par: h.par,
    yardage: h.yardage ?? null,
    score: h.score ?? null,
    putts: h.putts ?? null,
    fairway_hit: h.fairway_hit ?? null,
    gir: h.gir ?? null,
  }));

  const shots: RawShot[] = (shotsData ?? []).map((s: any) => ({
    id: s.id,
    round_id: s.round_id,
    hole_id: s.hole_id,
    hole_number: s.hole_number,
    shot_number: s.shot_number,
    shot_type: s.shot_type,
    club_type: s.club_type,
    lie_before: s.lie_before,
    lie_after: s.lie_after,
    distance_to_hole_before: s.distance_to_hole_before,
    distance_unit_before: s.distance_unit_before,
    result: s.result,
    distance_to_hole_after: s.distance_to_hole_after,
    distance_unit_after: s.distance_unit_after,
    shot_distance: s.shot_distance,
    miss_direction: s.miss_direction,
    putt_break: s.putt_break,
    putt_distance_feet: s.putt_distance_feet,
    putt_slope: s.putt_slope,
    putt_made: s.putt_made,
    is_penalty: s.is_penalty ?? false,
    penalty_type: s.penalty_type,
  }));

  const stats = calculateStatsFromShots(shots, holesInfo, roundsInfo);

  return {
    total: stats.strokesGainedTotal,
    tee: stats.strokesGainedTee,
    approach: stats.strokesGainedApproach,
    aroundGreen: stats.strokesGainedAroundGreen,
    putting: stats.strokesGainedPutting,
    totalPerRound: stats.sgTotalPerRound,
    teePerRound: stats.sgTeePerRound,
    approachPerRound: stats.sgApproachPerRound,
    aroundGreenPerRound: stats.sgAroundGreenPerRound,
    puttingPerRound: stats.sgPuttingPerRound,
  };
}

interface DiffSummary {
  playerId: string;
  before: CacheRow;
  after: ComputedSg;
}

function summarizeDiff(d: DiffSummary): string {
  const b = d.before;
  const a = d.after;
  return (
    `tee: ${fmt(b.strokes_gained_tee)}/${fmt(b.sg_tee_per_round)}r → ${fmt(a.tee)}/${fmt(a.teePerRound)}r | ` +
    `app: ${fmt(b.strokes_gained_approach)}/${fmt(b.sg_approach_per_round)}r → ${fmt(a.approach)}/${fmt(a.approachPerRound)}r | ` +
    `atg: ${fmt(b.strokes_gained_around_green)}/${fmt(b.sg_around_green_per_round)}r → ${fmt(a.aroundGreen)}/${fmt(a.aroundGreenPerRound)}r | ` +
    `putt: ${fmt(b.strokes_gained_putting)}/${fmt(b.sg_putting_per_round)}r → ${fmt(a.putting)}/${fmt(a.puttingPerRound)}r | ` +
    `total: ${fmt(b.strokes_gained_total)}/${fmt(b.sg_total_per_round)}r → ${fmt(a.total)}/${fmt(a.totalPerRound)}r`
  );
}

async function main() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE env vars');

  const dryRun = process.argv.includes('--dry-run');
  const noClearRoundCache = process.argv.includes('--no-clear-round-cache');
  const playerArg = process.argv.find((a) => a.startsWith('--player='));
  const singlePlayerId = playerArg ? playerArg.slice('--player='.length) : null;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Recomputing SG cache${
      singlePlayerId ? ` for player ${singlePlayerId}` : ' for ALL players'
    }...`,
  );

  // Fetch all cache rows
  let query = supabase
    .from('golf_player_stats_cache')
    .select(
      'player_id, rounds_played, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting, sg_total_per_round, sg_tee_per_round, sg_approach_per_round, sg_around_green_per_round, sg_putting_per_round',
    );

  if (singlePlayerId) query = query.eq('player_id', singlePlayerId);

  const { data: cacheRows, error: cacheErr } = await query;
  if (cacheErr) throw cacheErr;

  const rows = (cacheRows ?? []) as CacheRow[];
  console.log(`Inspecting ${rows.length} player cache rows...`);

  // Clear stale per-round SG values FIRST so that the trigger
  // `trg_update_player_stats_complete` (which fires on round-cache writes)
  // doesn't re-overwrite our player-cache values with sums of buggy
  // round-cache data after we've finished writing.
  if (!dryRun && !noClearRoundCache && !singlePlayerId) {
    console.log('Clearing stale per-round SG values in golf_round_stats_cache...');
    const { error: clearErr } = await supabase
      .from('golf_round_stats_cache')
      .update({
        strokes_gained_total: null,
        strokes_gained_tee: null,
        strokes_gained_approach: null,
        strokes_gained_around_green: null,
        strokes_gained_putting: null,
        updated_at: new Date().toISOString(),
      })
      .not('strokes_gained_total', 'is', null);
    if (clearErr) {
      console.warn(`[warn] failed to clear round cache SG — ${clearErr.message}`);
    } else {
      console.log('Round cache SG values cleared.');
    }
  } else if (dryRun) {
    console.log('[DRY RUN] would clear stale SG values in golf_round_stats_cache');
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  const diffs: DiffSummary[] = [];

  for (const row of rows) {
    processed++;
    const computed = await recomputeForPlayer(supabase, row.player_id);
    if (!computed) {
      skipped++;
      continue;
    }

    const drifted =
      row.strokes_gained_tee !== computed.tee ||
      row.strokes_gained_approach !== computed.approach ||
      row.strokes_gained_around_green !== computed.aroundGreen ||
      row.strokes_gained_putting !== computed.putting ||
      row.strokes_gained_total !== computed.total;

    if (!drifted) continue;

    const diff: DiffSummary = { playerId: row.player_id, before: row, after: computed };
    diffs.push(diff);

    const label = dryRun ? '[would update]' : '[updated]';
    console.log(`${label} ${row.player_id}: ${summarizeDiff(diff)}`);

    if (!dryRun) {
      const { error: updErr } = await supabase
        .from('golf_player_stats_cache')
        .update({
          strokes_gained_total: computed.total,
          strokes_gained_tee: computed.tee,
          strokes_gained_approach: computed.approach,
          strokes_gained_around_green: computed.aroundGreen,
          strokes_gained_putting: computed.putting,
          sg_total_per_round: computed.totalPerRound,
          sg_tee_per_round: computed.teePerRound,
          sg_approach_per_round: computed.approachPerRound,
          sg_around_green_per_round: computed.aroundGreenPerRound,
          sg_putting_per_round: computed.puttingPerRound,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', row.player_id);
      if (updErr) {
        console.warn(`[warn] ${row.player_id}: update failed — ${updErr.message}`);
        continue;
      }
      updated++;
    } else {
      updated++;
    }

    if (processed % 25 === 0) {
      console.log(`...${processed}/${rows.length} processed`);
    }
  }

  console.log(
    `Done. Processed ${processed}, drifted ${diffs.length}, updated ${updated}, skipped ${skipped}.${
      dryRun ? ' (dry run — no writes)' : ''
    }`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
