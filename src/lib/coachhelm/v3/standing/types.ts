/**
 * v3 standing types.
 *
 * Standing = the canonical "player + team + PGA" comparison snapshot
 * for a single metric. Master plan Part VII.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

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

  computed_at: string;
}

/**
 * Cold-start helper: does this standing have enough team data to render
 * the team marker? Master plan Part VII.3: render when team_n >= 5.
 */
export function hasTeamMarker(s: PlayerStanding): boolean {
  return s.team_n >= 5 && s.team_avg !== null;
}
