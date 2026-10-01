import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getSprayChartData } from '@/app/golf/actions/stats-data';
import type { SprayChartShotGroup } from '@/app/golf/actions/stats-data-types';
import { aggregateApproachBuckets, type ApproachShotRow, type PgaRef } from '@/lib/golf/leak-map-buckets';
import { chLogServer } from '../lib/track-server';
import type { ChHoleRow } from './stats-figures';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Every scored hole on these rounds (hole, par, score), for the toughest holes and the opening hole. */
export async function loadHoles(supabase: Supabase, roundIds: string[]): Promise<{ rows: ChHoleRow[]; error: boolean }> {
  const rows: ChHoleRow[] = [];
  const results = await Promise.all(
    chunkIds(roundIds).map((ids) =>
      fetchAllRowsResult<{ round_id: string; hole_number: number; par: number | null; score: number | null }>(
        (from, to) =>
          supabase
            .from('golf_holes')
            .select('round_id, hole_number, par, score')
            .in('round_id', ids)
            .not('score', 'is', null)
            .order('id', { ascending: true })
            .range(from, to),
        undefined,
        { table: 'golf_holes', action: 'clubhouse.stats.holes', feature: 'stats_analytics', sport: 'golf' },
      ),
    ),
  );
  for (const res of results) {
    if (res.error) {
      chLogServer('stats', 'holes', res.error, 'stats_analytics');
      return { rows: [], error: true };
    }
    for (const r of res.data ?? []) {
      if (typeof r.par === 'number' && typeof r.score === 'number') rows.push({ round_id: r.round_id, hole_number: r.hole_number, par: r.par, score: r.score });
    }
  }
  return { rows, error: false };
}

type ApproachRead = Omit<ApproachShotRow, 'par'> & { round_id: string; golf_holes: { par: number | null } | Array<{ par: number | null }> | null };

/** Every approach with a distance before and after, as the production leak map reads them (misses included). */
export async function loadApproachShots(supabase: Supabase, roundIds: string[]): Promise<{ rows: ApproachShotRow[]; error: boolean }> {
  const rows: ApproachShotRow[] = [];
  const results = await Promise.all(
    chunkIds(roundIds).map((ids) =>
      fetchAllRowsResult<ApproachRead>(
        (from, to) =>
          supabase
            .from('golf_shots')
            .select('round_id, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, result, lie_after, golf_holes ( par )')
            .in('round_id', ids)
            .eq('shot_type', 'approach')
            .not('distance_to_hole_before', 'is', null)
            .not('distance_to_hole_after', 'is', null)
            .order('id', { ascending: true })
            .range(from, to),
        undefined,
        { table: 'golf_shots', action: 'clubhouse.stats.approach', feature: 'stats_analytics', sport: 'golf' },
      ),
    ),
  );
  for (const res of results) {
    if (res.error) {
      chLogServer('stats', 'approachShots', res.error, 'stats_analytics');
      return { rows: [], error: true };
    }
    for (const { golf_holes, round_id: _round, ...shot } of res.data ?? []) {
      const hole = Array.isArray(golf_holes) ? golf_holes[0] : golf_holes;
      rows.push({ ...shot, par: typeof hole?.par === 'number' ? hole.par : null });
    }
  }
  return { rows, error: false };
}

export interface ChApproachBand {
  label: string;
  /** Average finish in feet over every approach from the band (hit or missed, lay-ups out); null under the floor. */
  value: number | null;
  bench: number | null;
  shots: number;
  belowFloor: boolean;
  floor: number;
  greenHitPct: number | null;
}

/** Approach proximity against the Tour in production's three bands, by its own aggregator (every approach, lay-ups out, 10 shots to grade). */
export function approachBands(rows: ApproachShotRow[], bench: Map<string, number>): ChApproachBand[] {
  const refs = new Map<string, PgaRef>([...bench].map(([k, v]) => [k, { pga_tour_value: v, div1_avg_value: null }]));
  return aggregateApproachBuckets(rows, refs).map((b) => ({
    label: b.label,
    value: b.team_value,
    bench: b.pga_value,
    shots: b.sample_n,
    belowFloor: !!b.below_floor,
    floor: b.min_n ?? 10,
    greenHitPct: b.green_hit_pct ?? null,
  }));
}

export interface ChSprayBand {
  /** The sector key: long_left, long, long_right, left, center, right, short_left, short, short_right. */
  sector: string;
  label: string;
  count: number;
  pct: number;
  avgForward: number | null;
  avgRemaining: number | null;
}
export interface ChSprayGroup {
  shots: number;
  avgForward: number | null;
  avgRemaining: number | null;
  playable: number;
  trouble: number;
  penalty: number;
  dominant: string | null;
  bands: ChSprayBand[];
}
export interface ChSpray {
  driving: ChSprayGroup;
  approach: ChSprayGroup;
}

const slim = (g: SprayChartShotGroup): ChSprayGroup => ({
  shots: g.plottedShots,
  avgForward: g.averageForwardDistance,
  avgRemaining: g.averageRemainingDistance,
  playable: g.playableCount,
  trouble: g.troubleCount,
  penalty: g.penaltyCount,
  dominant: g.dominantSector ? (g.summaryBands.find((b) => b.sector === g.dominantSector)?.label ?? null) : null,
  bands: g.summaryBands.map((b) => ({ sector: b.sector, label: b.label, count: b.count, pct: b.percentage, avgForward: b.avgForwardDistance, avgRemaining: b.avgRemainingDistance })),
});

/**
 * Where tee shots and approaches finish, by sector, over exactly these rounds (production's spray read; the dots
 * are not passed on, only the counts and averages). Production's action answers a failed read with an empty
 * response, so a failure here reads as "none logged", which is its own trap, not a Clubhouse one.
 */
export async function loadSpray(playerId: string, roundIds: string[]): Promise<{ spray: ChSpray | null; error: boolean }> {
  try {
    const r = await getSprayChartData(playerId, roundIds);
    return { spray: { driving: slim(r.driving), approach: slim(r.approach) }, error: false };
  } catch (e) {
    chLogServer('stats', 'spray', e, 'stats_analytics');
    return { spray: null, error: true };
  }
}
