/**
 * Shared types for the leak-map server action (`stats-leak-maps.ts`).
 *
 * Declared in a plain module (NOT the `'use server'` file) per the Next.js
 * rule that server-action files may only export async functions. Both the
 * coach surface (per-player drill-down + team aggregate) and the player
 * surface (single player) consume these shapes, and the Fairway `LeakMap`
 * chart maps them onto its `LeakMapBucket` prop.
 *
 * ADDITIVE / read-only — nothing here changes existing loader semantics.
 */

/**
 * One distance band of a leak map (putt-make% or approach-proximity).
 *
 * `team_value` carries the computed value for the level being reported:
 *   - putting  → make% (0-100), higher is better
 *   - approach → average proximity-to-hole in FEET, lower is better
 *
 * `pga_value` is the matching `golf_pga_standards.pga_tour_value`; it is
 * null for any band that has no PGA standard (e.g. the 0-3 ft putt band).
 */
export interface LeakBucket {
  /** Canonical metric id where one exists (e.g. 'putts_made_10_15ft_pct'); null for the 0-3 ft band. */
  metric_id: string | null;
  /** Stable band key, e.g. '10_15' / '125_175'. */
  bucket_id: string;
  /** Human label, e.g. '10-15 ft' / '125-175 yd'. */
  label: string;
  /** Computed value for the band: make% (putting) or avg proximity ft (approach). Null when sample_n === 0. */
  team_value: number | null;
  /** PGA Tour reference (`pga_tour_value`); null where no standard exists. */
  pga_value: number | null;
  /** Division-1 reference (`div1_avg_value`); null where no standard exists. */
  div1_value: number | null;
  /** Gradeable shots / attempts contributing to `team_value`. */
  sample_n: number;
}

/** Team-level leak maps (both families) for the coach surface. */
export interface TeamLeakMaps {
  teamId: string;
  /** Putt-make% buckets: 0-3 … 25+ ft (higher is better). */
  putting: LeakBucket[];
  /** Approach-proximity buckets: 50-125 / 125-175 / 175+ yd (lower is better). */
  approach: LeakBucket[];
  /** Completed rounds rolled into the aggregate. */
  roundsIncluded: number;
}

/** Single-player leak maps for the player surface (same band shapes). */
export interface PlayerLeakMaps {
  playerId: string;
  putting: LeakBucket[];
  approach: LeakBucket[];
  roundsIncluded: number;
}

/** Plain, serialization-safe standing row for client consumers. */
export interface PlayerStandingRow {
  metric_id: string;
  player_value: number;
  team_avg: number | null;
  team_n: number;
  team_pct: number | null;
  pga_value: number;
  pga_delta: number | null;
  /**
   * True for women's-team rows (gender-anchored by the standing loader).
   * Render layers label the Tour reference "LPGA" instead of "PGA".
   */
  is_womens?: boolean;
}

/** Standard server-action envelope used by every export in this module. */
export interface LeakMapResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
