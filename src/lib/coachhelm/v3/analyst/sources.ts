/**
 * CoachHelm analyst: what the fact sheet reads, as an interface.
 *
 * The builder takes these loaders so tests hand it fixtures and the dry run hands it a Supabase client
 * (`supabase-sources.ts`). Every method THROWS on a failed read: a failed read is never an empty one.
 *
 * The rows are the columns the Stats screens read, from the same tables:
 *   golf_rounds              the round, its stored strokes gained (src/clubhouse/data/season.ts ROUND_COLUMNS)
 *   golf_round_stats_cache   per-round counts (src/clubhouse/data/stats-common.ts loadRoundCache)
 *   golf_holes               par and score per hole (src/clubhouse/data/stats-detail.ts loadHoles)
 *   golf_shots               putts and approaches (src/app/golf/actions/stats-leak-maps.ts)
 *   golf_pga_standards       the Tour figures (src/clubhouse/data/stats-common.ts readTourBenchmarks)
 *
 * Pure types.
 */

export interface TeamRow {
  id: string;
  /** `golf_teams.gender`: 'womens' picks the LPGA figures and the scaled strokes-gained baseline. */
  gender: string | null;
  /** The zone the season turns in: `golf_team_settings.timezone`, already validated (the Stats screens' rule). */
  timezone: string;
  /** `golf_team_settings.sg_baseline` ('pga_tour' or 'womens') when the team set one; else the team's gender decides. */
  sg_baseline?: string | null;
}

/** A completed, real (`is_test = false`) round with a total. The countable rule is applied by the builder, not the loader. */
export interface RoundRow {
  id: string;
  player_id: string;
  /** YYYY-MM-DD (a calendar day, not an instant). */
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  front_nine: number | null;
  back_nine: number | null;
  holes_played: number | null;
  total_putts: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
}

/** `golf_round_stats_cache`, the columns Stats' comparison table reads. */
export interface RoundCacheRow {
  round_id: string;
  greens_hit: number | null;
  greens_total: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  total_putts: number | null;
  scramble_attempts: number | null;
  scrambles_converted: number | null;
  sand_attempts: number | null;
  sand_saves: number | null;
  three_putts: number | null;
  penalty_strokes: number | null;
  birdies: number | null;
  eagles: number | null;
  pars: number | null;
  bogeys: number | null;
  double_bogeys: number | null;
  triple_plus: number | null;
}

export interface HoleRow {
  id: string;
  round_id: string;
  hole_number: number;
  par: number | null;
  score: number | null;
}

/** One `golf_shots` row: what the make-rate definition, the approach bands and the measured-or-estimated check read. */
export interface ShotRow {
  id: string;
  round_id: string;
  hole_id: string | null;
  hole_number: number | null;
  shot_number: number | null;
  shot_type: string | null;
  club_type: string | null;
  is_penalty: boolean | null;
  miss_direction: string | null;
  lie_before: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  result: string | null;
  lie_after: string | null;
  putt_made: boolean | null;
  /** Read only to count where the two make-rate definitions in the app disagree (putt-definitions.ts). No figure uses it. */
  putt_distance_feet: number | null;
}

/** One `golf_pga_standards` row for the team's own tour (newest season per metric). */
export interface TourStandardRow {
  metric_id: string;
  /** `pga_tour_value` (the column holds the LPGA value on an LPGA row). */
  value: number | null;
  source: string | null;
}

export interface AnalystSources {
  /** Null when the team does not exist. */
  team(teamId: string): Promise<TeamRow | null>;
  /** The team's active members (`golf_team_members.status = 'active'`). */
  activePlayerIds(teamId: string): Promise<string[]>;
  /** Completed, real rounds with a total, on or after `since` (YYYY-MM-DD). */
  rounds(playerIds: readonly string[], since: string): Promise<RoundRow[]>;
  roundCache(roundIds: readonly string[]): Promise<RoundCacheRow[]>;
  holes(roundIds: readonly string[]): Promise<HoleRow[]>;
  shots(roundIds: readonly string[]): Promise<ShotRow[]>;
  tourStandards(tour: 'pga' | 'lpga'): Promise<TourStandardRow[]>;
}
