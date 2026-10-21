/**
 * Per-round made / attempted counts for a verdict metric, from rows the job
 * loaded (putts from `golf_shots`, per-round counts from
 * `golf_round_stats_cache`). See `metrics.ts` for why each source matches
 * the read it judges.
 *
 * Pure.
 */
import type { RoundCacheCountColumn, VerdictCountSource } from './metrics';

export interface PuttShotRow {
  round_id: string;
  distance_to_hole_before: number | null;
  result: string | null;
  putt_made: boolean | null;
}

export type RoundCacheRow = { round_id: string } & Partial<Record<RoundCacheCountColumn, number | null>>;

export interface RoundCounts {
  made: number;
  attempts: number;
}

/** Same banding as update_player_putt_make_pct: feet clamped to [0, 120], (lo, hi]. */
export function countPuttsByRound(
  shots: readonly PuttShotRow[],
  band: Extract<VerdictCountSource, { kind: 'putt_band' }>,
): Map<string, RoundCounts> {
  const out = new Map<string, RoundCounts>();
  for (const s of shots) {
    if (typeof s.distance_to_hole_before !== 'number' || !Number.isFinite(s.distance_to_hole_before)) continue;
    const feet = Math.min(Math.max(s.distance_to_hole_before, 0), 120);
    if (!(feet > band.minFeetExclusive)) continue;
    if (band.maxFeetInclusive !== null && feet > band.maxFeetInclusive) continue;
    const made = s.result === 'hole' || s.putt_made === true;
    const c = out.get(s.round_id) ?? { made: 0, attempts: 0 };
    c.attempts += 1;
    if (made) c.made += 1;
    out.set(s.round_id, c);
  }
  return out;
}

/** Numerator and denominator columns of one cache row; rows missing either are skipped. */
export function countCacheByRound(
  rows: readonly RoundCacheRow[],
  source: Extract<VerdictCountSource, { kind: 'round_cache' }>,
): Map<string, RoundCounts> {
  const out = new Map<string, RoundCounts>();
  for (const r of rows) {
    const made = r[source.made];
    const attempts = r[source.attempts];
    if (typeof made !== 'number' || typeof attempts !== 'number' || !(attempts > 0)) continue;
    out.set(r.round_id, { made: Math.max(0, Math.min(made, attempts)), attempts });
  }
  return out;
}
