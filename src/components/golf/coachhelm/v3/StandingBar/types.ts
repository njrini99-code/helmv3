/**
 * v3 StandingBar — public type surface.
 *
 * Master plan Part VII.3:
 *   Universal 3-marker comparison: PGA + team + you, with optional
 *   cohort percentile text. Cold-start rule: when team_n < 5, the team
 *   marker is omitted at render time but the bar still shows player vs
 *   PGA. Render gracefully degrades when PGA reference is null.
 */

export type Direction = 'higher_better' | 'lower_better';

export type Unit = 'percent' | 'strokes' | 'yards' | 'count' | 'feet';

export type SizeVariant = 'inline' | 'card' | 'hero';

export type RenderState = 'happy' | 'cold-start' | 'loading' | 'error' | 'empty';

export interface StandingBarProps {
  /** Canonical metric id (from golf_metrics.metric_id). */
  metric_id: string;

  /** Display label — e.g. "6-15 ft Putting". */
  metric_label: string;

  /** The player's value. */
  player_value: number;

  /**
   * Team average. Null means cold-start (team has <5 active players
   * with 5+ rounds) — the team marker is omitted.
   */
  team_avg: number | null;

  /** PGA Tour reference value. */
  pga_value: number;

  /**
   * Suppress the PGA/Field reference marker + value (audit P3). Set true when
   * the metric has NO credible cohort anchor for this player (e.g. a women's
   * player on course_management / par-type scoring, where the men's value would
   * mislead and no women's baseline exists). When true the bar renders You (and
   * Team) only, drops the reference value text, and omits the reference from the
   * aria label. Default false — the marker renders as usual.
   */
  pga_omitted?: boolean;

  /**
   * True when the player's team is a women's program. When set, the Tour
   * reference label changes from "PGA" to "LPGA" (and `pga_value` is expected
   * to already carry the LPGA anchor via `applyGenderAnchor`). Defaults to
   * false — men's / unknown teams are unchanged.
   */
  is_womens?: boolean;

  /** Player percentile within team (0-100, higher = better). Null in cold-start. */
  team_pct?: number | null;

  /** Number of teammates contributing to team_avg. <5 triggers cold-start. */
  team_n?: number;

  /** Division-level percentile (0-100). Null until populated. */
  level_pct?: number | null;

  /** Whether higher is better for this metric. Drives arrow/tone color. */
  direction: Direction;

  /** Display unit. */
  unit: Unit;

  /** Visual scale for marker positioning. */
  scale: { min: number; max: number };

  /** Size variant. */
  size: SizeVariant;

  /** Show "+X.X vs team" delta line under the bar. Default: false. */
  show_delta?: boolean;

  /** Show "Bottom 18% on your team" cohort text. Default: true. */
  show_cohort_text?: boolean;

  /** Manual aria-label override. If omitted, derived from props. */
  ariaLabel?: string;

  /**
   * State override. When omitted, derived from props:
   *   - 'loading' if you pass `loading` instead (via wrapper).
   *   - 'cold-start' if team_avg === null OR team_n < 5.
   *   - 'happy' otherwise.
   * 'error' / 'empty' must be explicit.
   */
  state?: RenderState;

  /** Used when state === 'error'. */
  errorMessage?: string;
}

/** Threshold below which the team marker is omitted (Part VII.3 cold-start rule). */
export const TEAM_MARKER_MIN_N = 5;

/**
 * Roster size below which percentile-as-percent language ("Top 1% / Bottom 1%
 * on your team") is statistically meaningless and reads as nonsense — a college
 * golf roster is ~8-12, so "top 1% of 7" is absurd. Below this floor the extreme
 * buckets fall back to qualitative phrasing ("Top of your team" / "Bottom of
 * your team"). 20 ≈ the smallest roster where a single-digit percentile maps to
 * roughly one real player.
 */
export const PCT_LANGUAGE_MIN_N = 20;
