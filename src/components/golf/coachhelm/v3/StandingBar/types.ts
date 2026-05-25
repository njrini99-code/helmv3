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
