// Pure (no server-only) so the Clubhouse thread can import the chip names. Step wording for Ask's wider reads (see wide-read-tools.ts).

/**
 * The step each read announces, in the present and the past tense (Ask v2 folds a finished step into its past-tense line). Raw tool
 * names never reach the interface. The player's benchmark read is worded for "you".
 */
export const WIDE_READ_STEPS: Record<string, readonly [doing: string, done: string]> = {
  get_benchmarks: ['Looking up the benchmarks', 'Looked up the benchmarks'],
  get_metric_definitions: ['Looking up what the metric measures', 'Looked up what the metric measures'],
  get_golf_reference: ['Checking the golf reference', 'Checked the golf reference'],
  get_attendance_summary: ['Reading attendance', 'Read attendance'],
  get_goals: ['Reading goals and progress', 'Read goals and progress'],
  get_focus_practice: ['Reading focus-area practice', 'Read focus-area practice'],
  get_round_stats: ['Reading the round stat lines', 'Read the round stat lines'],
  get_qualifier_entries: ['Reading qualifier entries and selections', 'Read qualifier entries and selections'],
  get_tournament_notes: ['Reading tournament reviews and notes', 'Read tournament reviews and notes'],
  get_team_season_settings: ['Reading the seasons, terms and settings', 'Read the seasons, terms and settings'],
  query_team_data: ['Looking through the team’s records', 'Looked through the team’s records'],
};
export const PLAYER_BENCHMARK_STEP = ['Looking up how you compare', 'Looked up how you compare'] as const;

/** The short name a finished read carries on its chip. */
export const WIDE_READ_CHIPS: Record<string, string> = {
  get_benchmarks: 'Benchmarks',
  get_metric_definitions: 'Definitions',
  get_golf_reference: 'Golf reference',
  get_attendance_summary: 'Attendance',
  get_goals: 'Goals',
  get_focus_practice: 'Focus practice',
  get_round_stats: 'Round stats',
  get_qualifier_entries: 'Qualifier entries',
  get_tournament_notes: 'Tournament notes',
  get_team_season_settings: 'Season',
  query_team_data: 'Team records',
};
