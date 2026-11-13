import type { Database } from '@/lib/types/database';

/**
 * The allowlist behind `query_team_data`: the only tables and columns Ask can read through the generic reader. It is STATIC and
 * typed against `database.ts`: a column that is not on the table's row type does not compile (`satisfies Allowlist`), so a rename
 * in the schema breaks the build here instead of reading nothing.
 *
 * Adding a table is a decision about what a coach's assistant may see, so each entry needs a way to scope it to the team:
 *   - `scope: 'team'`   the table has `team_id`; every query is forced to the session's team.
 *   - `scope: 'player'` the table has `player_id`; every query is forced to the active roster's ids.
 * A table with neither is not allowlisted, however useful (`golf_drills` and `golf_courses` are reference data with their own reads).
 *
 * Performance, schedule and practice tables only. Never added (the test in `__tests__/team-query-allowlist.test.ts` fails if they are):
 *   - `golf_players` and any contact, academic or personal column (email, phone, GPA, hometown, school): the roster is id, name, class year;
 *   - recruits and recruit notes and documents;
 *   - messages, conversations, attachments, reactions, mentions, responses and announcements;
 *   - availability coach notes, academic exclusions, class schedules, class settings and exceptions (the calendar's conflicts-only RPC covers those);
 *   - invite codes, ingest connections, calendar feeds, push, demo sessions, join requests, the behaviour log, platform metrics, auth and tokens;
 *   - free-text columns written by players or coaches (round notes, practice notes, descriptions): a typed read quotes those, with a warning, where they matter.
 * Reads use the caller's own session. The service client is never used here.
 */

type Tables = Database['public']['Tables'];
type RowOf<T extends keyof Tables> = Tables[T]['Row'];
type Col<T extends keyof Tables> = keyof RowOf<T> & string;

export interface TableRule<T extends keyof Tables> {
  /** What the coach calls it: used in summaries (a summary never names a table). */
  label: string;
  scope: 'team' | 'player';
  /** The only columns a query may select, filter or order on. The scope column is added by the reader; it is not listed. */
  columns: readonly Col<T>[];
  /** Newest first unless the rule says otherwise. */
  order: { column: Col<T>; ascending: boolean };
  /** Always applied. */
  forced?: { [K in Col<T>]?: string | number | boolean };
  /** The table belongs to a flagged feature: the tool offers it only while the flag is on. */
  flag?: 'golf_tournaments_v1';
}

type Allowlist = { [T in keyof Tables]?: TableRule<T> };

export const TEAM_QUERY_TABLES = {
  // --- Performance -----------------------------------------------------------
  golf_rounds: {
    label: 'rounds',
    scope: 'player',
    columns: ['id', 'round_date', 'round_type', 'status', 'holes_played', 'course_name', 'total_score', 'score_to_par', 'total_putts', 'total_gir', 'total_gir_possible', 'total_fairways_hit', 'total_fairways', 'total_penalties', 'front_nine', 'back_nine', 'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach', 'strokes_gained_around_green', 'strokes_gained_putting', 'qualifier_id', 'qualifier_round_number', 'tees_played', 'course_rating', 'course_slope', 'weather_conditions'],
    order: { column: 'round_date', ascending: false },
    forced: { is_test: false },
  },
  golf_round_stats_cache: {
    label: 'round stat lines',
    scope: 'player',
    columns: ['round_id', 'total_score', 'score_to_par', 'front_nine', 'back_nine', 'total_putts', 'one_putts', 'three_putts', 'greens_hit', 'greens_total', 'fairways_hit', 'fairways_total', 'penalty_strokes', 'eagles', 'birdies', 'pars', 'bogeys', 'double_bogeys', 'triple_plus', 'scramble_attempts', 'scrambles_converted', 'sand_attempts', 'sand_saves', 'driving_distance_avg', 'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach', 'strokes_gained_around_green', 'strokes_gained_putting', 'updated_at'],
    order: { column: 'updated_at', ascending: false },
  },
  golf_player_stats_cache: {
    label: 'career statistics',
    scope: 'player',
    columns: ['rounds_played', 'rounds_this_season', 'scoring_average', 'scoring_average_vs_par', 'last_5_average', 'last_10_average', 'best_round', 'worst_round', 'par3_average', 'par4_average', 'par5_average', 'gir_percentage', 'driving_accuracy_percentage', 'driving_distance_average', 'putts_per_round', 'putts_per_gir', 'one_putt_percentage', 'three_putt_percentage', 'scrambling_percentage', 'sand_save_percentage', 'penalty_strokes_per_round', 'sg_total_per_round', 'sg_tee_per_round', 'sg_approach_per_round', 'sg_around_green_per_round', 'sg_putting_per_round', 'putt_make_pct_0_3ft', 'putt_make_pct_3_5ft', 'putt_make_pct_5_10ft', 'putt_make_pct_10_15ft', 'putt_make_pct_15_25ft', 'putt_make_pct_25_plus_ft', 'approach_proximity_average', 'trend_direction', 'improvement_trend', 'first_round_date', 'last_round_date', 'updated_at'],
    order: { column: 'updated_at', ascending: false },
  },
  golf_player_standing: {
    label: 'standing against the Tour, team and level',
    scope: 'player',
    // Not pga_value / pga_delta: those are the men's Tour anchor on every row, whatever the team. get_benchmarks compares against the right tour.
    columns: ['metric_id', 'player_value', 'level_avg', 'level_n', 'level_pct', 'team_avg', 'team_n', 'team_pct', 'basis', 'computed_at'],
    order: { column: 'metric_id', ascending: true },
  },
  golf_goals: {
    label: 'goals',
    scope: 'player',
    columns: ['id', 'title', 'category', 'metric_id', 'state', 'origin', 'baseline_value', 'current_value', 'target_value', 'started_at', 'ends_at', 'window_days', 'target_source', 'outcome_evaluated_at'],
    order: { column: 'ends_at', ascending: true },
  },
  golf_player_focus_areas: {
    label: 'focus areas',
    scope: 'player',
    columns: ['id', 'title', 'area_type', 'status', 'priority', 'target_metric', 'target_kind', 'target_value', 'current_value', 'baseline_value', 'target_date', 'target_rounds', 'check_after_rounds', 'started_at', 'completed_at', 'outcome_status', 'created_at', 'updated_at'],
    order: { column: 'updated_at', ascending: false },
  },
  golf_focus_area_practice_sessions: {
    label: 'focus-area practice',
    scope: 'player',
    columns: ['id', 'focus_area_id', 'practiced_at', 'reps', 'logged_by_role'],
    order: { column: 'practiced_at', ascending: false },
  },
  golf_focus_area_criteria: {
    label: 'focus-area criteria',
    scope: 'player',
    columns: ['id', 'focus_area_id', 'label', 'met', 'met_at', 'source'],
    order: { column: 'met_at', ascending: false },
  },
  golf_qualifiers: {
    label: 'qualifiers',
    scope: 'team',
    columns: ['id', 'name', 'course_name', 'start_date', 'end_date', 'entry_deadline', 'status', 'num_rounds', 'spots_available', 'selection_state', 'selection_slots_total', 'selection_slots_coach_pick', 'target_tournament_id'],
    order: { column: 'start_date', ascending: false },
    forced: { is_test: false },
  },
  golf_qualifier_entries: {
    label: 'qualifier entries',
    scope: 'player',
    columns: ['qualifier_id', 'round_id', 'position', 'is_tied', 'rounds_completed', 'score', 'total_score', 'total_to_par', 'status'],
    order: { column: 'position', ascending: true },
  },
  golf_qualifier_selections: {
    label: 'qualifier selections',
    scope: 'player',
    columns: ['qualifier_id', 'selection_type', 'selected_at'],
    order: { column: 'selected_at', ascending: false },
  },
  // --- Schedule --------------------------------------------------------------
  golf_events: {
    label: 'events',
    scope: 'team',
    columns: ['id', 'title', 'event_type', 'start_time', 'end_time', 'all_day', 'location', 'status', 'requires_rsvp', 'rsvp_deadline', 'recurring', 'parent_event_id', 'max_attendees', 'cancelled_at'],
    order: { column: 'start_time', ascending: false },
  },
  golf_event_attendance: {
    label: 'event replies and check-ins',
    scope: 'player',
    columns: ['id', 'event_id', 'status', 'attendance_status', 'checked_in', 'checked_in_at', 'rsvp_at'],
    order: { column: 'rsvp_at', ascending: false },
  },
  golf_team_seasons: {
    label: 'team seasons',
    scope: 'team',
    columns: ['season', 'conference', 'division', 'official_rank', 'official_rank_at'],
    order: { column: 'season', ascending: false },
  },
  golf_team_terms: {
    label: 'school terms',
    scope: 'team',
    columns: ['id', 'label', 'classes_start', 'classes_end', 'exams_end', 'time_zone'],
    order: { column: 'classes_start', ascending: false },
  },
  golf_team_settings: {
    label: 'team settings',
    scope: 'team',
    columns: ['scoring_format', 'handicap_system', 'default_tees', 'sg_baseline', 'sg_benchmark_level', 'timezone'],
    order: { column: 'scoring_format', ascending: true },
  },
  // --- Practice --------------------------------------------------------------
  golf_practice_sessions: {
    label: 'logged practice sessions',
    scope: 'player',
    // Not shots_data: the shots are read by get_shot_pattern.
    columns: ['id', 'session_date', 'source', 'created_at'],
    order: { column: 'session_date', ascending: false },
  },
  // --- Tournaments (golf_tournaments_v1) -------------------------------------
  golf_tournaments: {
    label: 'tournaments',
    scope: 'team',
    flag: 'golf_tournaments_v1',
    columns: ['id', 'name', 'start_date', 'end_date', 'event_kind', 'format', 'rounds_count', 'holes_per_round', 'field_size', 'counting', 'players_per_team', 'host'],
    order: { column: 'start_date', ascending: false },
  },
  golf_tournament_entries: {
    label: 'tournament entries',
    scope: 'player',
    flag: 'golf_tournaments_v1',
    columns: ['tournament_id', 'role', 'slot'],
    order: { column: 'slot', ascending: true },
  },
  golf_tournament_rounds: {
    label: 'tournament rounds',
    scope: 'team',
    flag: 'golf_tournaments_v1',
    columns: ['tournament_id', 'round_number', 'round_event_id', 'status', 'first_tee_at', 'course_label'],
    order: { column: 'first_tee_at', ascending: false },
  },
  golf_tournament_player_rounds: {
    label: 'tournament round scores',
    scope: 'player',
    flag: 'golf_tournaments_v1',
    columns: ['round_event_id', 'round_id', 'status', 'entered_front', 'entered_back', 'entered_total', 'wd_after_hole'],
    order: { column: 'updated_at', ascending: false },
  },
} satisfies Allowlist;

export type TeamQueryTable = keyof typeof TEAM_QUERY_TABLES;
export const TEAM_QUERY_TABLE_NAMES = Object.keys(TEAM_QUERY_TABLES) as [TeamQueryTable, ...TeamQueryTable[]];

/** Every table and the columns it allows, as the reader sees them (loosely typed: the reader validates at run time). */
export interface LooseRule {
  label: string;
  scope: 'team' | 'player';
  columns: readonly string[];
  order: { column: string; ascending: boolean };
  forced?: Record<string, string | number | boolean>;
  flag?: 'golf_tournaments_v1';
}
export const looseRule = (table: string): LooseRule | undefined => (TEAM_QUERY_TABLES as unknown as Record<string, LooseRule | undefined>)[table];
