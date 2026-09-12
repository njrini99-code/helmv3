/**
 * Tour-basis comparability for standing rows (addendum A2, read level).
 *
 * WHY THIS EXISTS
 * ---------------
 * `refresh_player_standing_shot_metrics` writes the three approach-proximity
 * rows from GREEN-FINDING approaches only (`player_value` = average leave of
 * the shots that hit the green), while `pga_value` for the same metric ids is
 * the Tour's proximity over EVERY approach from the band, misses included
 * (seed: 18 / 30 / 45 ft). The two numbers are different quantities. Read on
 * one bar, a player who misses long greens looks like they "beat Tour" from
 * 175+ (production 2026-09-12: on-green averages 22.6 ft and 26.7 ft against
 * anchors of 30 and 45) — the misses that hurt them are exactly the shots the
 * player figure drops.
 *
 * The RPC basis itself is Package 7B work (all-shot proximity needs the
 * lay-up / intent split before it is honest either). Until then every reader
 * of `golf_player_standing` must treat the Tour marker on these ids as
 * NOT COMPARABLE: the standing loaders stamp `pga_omitted: true` with
 * `pga_omitted_reason: 'basis_mismatch'` (the same render path the women's
 * no-anchor omission uses), the goal-suggestion writer refuses to rank a gap
 * it cannot measure, and the goal modal offers no midpoint-to-Tour target.
 * Team ticks stay — teammates are measured on the same on-green basis.
 *
 * `ApproachMissGenerator.standingTourComparable = false` is the generator-side
 * expression of the same rule for the standing block it injects into
 * `evidence.standing`; this module is the read-side rule for every other
 * consumer (home/stats standing tiles, goals, suggestions).
 */

import type { PlayerStanding } from './types';

/**
 * Registry ids whose `golf_player_standing.player_value` is measured on a
 * different basis than their `pga_value`. Keep in sync with the RPC's on-green
 * filter (`supabase/migrations/20260609230000_v3_gender_scoped_sibling_cohorts.sql`)
 * — when Package 7B moves the row to all-shot proximity, remove the id here.
 */
export const STANDING_TOUR_BASIS_MISMATCH: ReadonlySet<string> = new Set([
  'approach_proximity_50_125ft',
  'approach_proximity_125_175ft',
  'approach_proximity_175_plus_ft',
]);

/** True when the row's Tour marker measures the same quantity as `player_value`. */
export function isStandingTourComparable(metricId: string): boolean {
  return !STANDING_TOUR_BASIS_MISMATCH.has(metricId);
}

/**
 * Stamp the omission on a standing row whose Tour marker is not comparable.
 * Pure — returns the row untouched (same reference) for every other metric,
 * and never un-omits a row the gender anchor already omitted.
 */
export function applyTourBasis(standing: PlayerStanding): PlayerStanding {
  if (isStandingTourComparable(standing.metric_id)) return standing;
  if (standing.pga_omitted) return standing;
  return {
    ...standing,
    pga_omitted: true,
    pga_omitted_reason: 'basis_mismatch',
  };
}
