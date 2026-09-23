/**
 * v3 standing types.
 *
 * Standing = the canonical "player + team + PGA" comparison snapshot
 * for a single metric. Master plan Part VII.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

/** Why a standing row's Tour marker is suppressed (`pga_omitted: true`). */
export type PgaOmissionReason = 'no_womens_anchor' | 'basis_mismatch';

/** A row from `public.golf_player_standing`. */
export interface PlayerStanding {
  player_id: string;
  metric_id: MetricId;

  player_value: number;

  /** Team marker — null or low when team_n < 5 (cold-start). */
  team_avg: number | null;
  team_n: number;
  /** Percentile 0-100 within the team. Null in cold-start. */
  team_pct: number | null;

  /** Cohort tier (division-level) marker. Null until populated. */
  level_avg: number | null;
  level_n: number;
  level_pct: number | null;

  /** Tour reference — present iff a PGA standard exists for the metric. */
  pga_value: number;
  /** player_value - pga_value (signed; direction interpreted via golf_metrics.direction). */
  pga_delta: number | null;

  /**
   * Gender-anchor omission flag (audit P3). Set true ONLY by
   * {@link applyGenderAnchor} for a women's-cohort player on a metric that has
   * NO credible women's anchor (course_management big_number_rate /
   * penalty_rate_per_round; par-type scoring_par_*). The men's `pga_value`
   * would mislead, so the render layer should suppress the reference marker
   * rather than draw a wrong one. Undefined/false → render the marker as usual
   * (the default for every men's / unknown-cohort row — unchanged behavior).
   */
  pga_omitted?: boolean;

  /**
   * Why the Tour marker is omitted, when `pga_omitted` is true. Render layers
   * turn it into a one-line caption so "—" reads as "not comparable" rather
   * than "missing data".
   *   - `no_womens_anchor`: women's cohort, no LPGA row and no estimate.
   *   - `basis_mismatch`: `player_value` is on-green-only proximity while
   *     `pga_value` is all-shot Tour proximity (see ./tour-basis.ts).
   */
  pga_omitted_reason?: PgaOmissionReason;

  /**
   * True when this row was gender-anchored for a women's-team player by
   * {@link applyGenderAnchor} (LPGA wire-up, 2026-06-10). Render layers use it
   * to label the Tour reference "LPGA" instead of "PGA" (StandingBar /
   * StandingStrip `is_womens` prop). Undefined/false for men's / unknown
   * cohorts — unchanged behaviour.
   */
  is_womens?: boolean;

  /**
   * approach_proximity_* only (Package 7B / addendum A2, 2026-09-22). Set to
   * 'all_shot' by refresh_player_standing_shot_metrics: player_value there is
   * averaged over every eligible approach in the band, misses included, on
   * the same basis as pga_value (previously on-green-only, which is why the
   * Tour marker was withheld — see tour-basis.ts). Undefined/null for every
   * other metric_id and for a row this migration's function hasn't refreshed
   * yet — treat those as not (yet) Tour-comparable, not as "on_green".
   */
  basis?: 'on_green' | 'all_shot' | null;

  /**
   * approach_proximity_* only: the pre-Package-7B ON-GREEN-only proximity
   * (feet), preserved for a consumer that specifically wants that figure
   * (e.g. v3/composite/rules/short-approach-proximity-gap.ts, which compares
   * against its own fixed dial-in target, never against Tour) now that
   * player_value has moved to the all-shot basis. Null below the on-green
   * sample floor or for any other metric_id.
   */
  on_green_proximity_feet?: number | null;

  /**
   * approach_proximity_175_plus_ft only: count of approach shots in this
   * player's band excluded from player_value as likely deliberate lay-ups
   * (par-5 hole, 175+ yd, did not finish on the green — a derived heuristic,
   * not recorded intent). 0 for the two shorter bands and any other metric.
   */
  layup_excluded_n?: number | null;

  computed_at: string;
}


