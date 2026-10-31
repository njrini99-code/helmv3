/**
 * P016 Tournaments: the seventeen held tables, typed by hand in this one module (held data plan, "What reads these
 * tables"; handoff 11.7), shared by the Clubhouse loaders and the server actions.
 * They come with supabase/migrations/20261024100000_golf_tournaments.sql, which is HELD, so they are not in
 * src/lib/types/database.ts yet and `npm run db:types` must not be run for them. Every read and write of a tournament
 * table goes through `tourTable` here, which types the client with `TourDatabase` (the rows below in the generated
 * types' shape), so the PR that applies the migrations and regenerates the types deletes this file and its callers
 * switch to `supabase.from(...)` with the generated rows.
 *
 * Columns are the migration's, one for one; only the shapes the loaders and actions read are spelled out. Pure types and
 * one helper: no I/O of its own.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const TOUR_TABLES = [
  'golf_tournaments',
  'golf_tournament_rounds',
  'golf_tournament_entries',
  'golf_tournament_round_lineups',
  'golf_tournament_player_rounds',
  'golf_tournament_field_teams',
  'golf_tournament_field_scores',
  'golf_tournament_result_marks',
  'golf_tournament_entry_notes',
  'golf_tournament_reviews',
  'golf_tournament_player_notes',
  'golf_tournament_reflections',
  'golf_tournament_advice_givers',
  'golf_tournament_coach_presence',
  'golf_saved_comparisons',
  'golf_team_seasons',
  'golf_tournament_link_dismissals',
] as const;
export type TourTableName = (typeof TOUR_TABLES)[number];

export type TourDbFormat = '5c4' | '6c5' | '6c4' | 'custom' | 'match' | 'medal_match' | 'individual';
export type TourDbEventKind = 'regular' | 'conference' | 'ncaa_regional' | 'ncaa_championship' | 'exhibition';
export type TourDbRoundStatus = 'upcoming' | 'live' | 'suspended_weather' | 'suspended_other' | 'final';
export type TourDbRole = 'lineup' | 'alternate' | 'individual';

export interface TourRow {
  id: string;
  team_id: string;
  name: string;
  start_date: string;
  end_date: string;
  course_id: string | null;
  format: TourDbFormat;
  players_per_team: number;
  counting: number;
  holes_per_round: 9 | 18;
  rounds_count: number;
  event_kind: TourDbEventKind;
  tiebreak: 'ties_stand' | 'ncaa' | 'playoff' | 'card_playoff';
  field_size: number | null;
  line_kind: 'advance' | 'cut' | 'match_play' | null;
  line_value: number | null;
  substitutions: boolean;
  lock_minutes: number;
  lineup_locked_at: string | null;
  lineup_published_at: string | null;
  official_at: string | null;
  results_url: string | null;
  host: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface TourRoundRow {
  round_event_id: string;
  tournament_id: string;
  team_id: string;
  round_number: number;
  course_id: string | null;
  tee_id: string | null;
  start_type: 'tee_times' | 'shotgun' | 'two_tees';
  first_tee_at: string | null;
  status: TourDbRoundStatus;
  status_changed_at: string;
  event_adopted: boolean;
}

export interface TourEntryRow {
  tournament_id: string;
  team_id: string;
  player_id: string;
  role: TourDbRole;
  slot: number | null;
}

export interface TourRoundLineupRow {
  round_event_id: string;
  team_id: string;
  player_id: string;
  role: TourDbRole;
  slot: number | null;
  substituted_for: string | null;
  substituted_at: string | null;
}

export interface TourPlayerRoundRow {
  round_event_id: string;
  team_id: string;
  player_id: string;
  round_id: string | null;
  entered_total: number | null;
  entered_front: number | null;
  entered_back: number | null;
  status: 'ok' | 'wd' | 'dq' | 'dq_pending';
  wd_after_hole: number | null;
  link_source: 'coach' | 'auto' | 'player' | null;
  note: string | null;
  updated_at: string;
}

export interface TourFieldTeamRow {
  id: string;
  tournament_id: string;
  team_id: string;
  name: string;
  is_us: boolean;
  is_b_team: boolean;
  same_division: boolean;
  seed: number | null;
  final_place: number | null;
  final_place_tied: boolean;
  final_total: number | null;
}

export interface TourFieldScoreRow {
  field_team_id: string;
  team_id: string;
  round_number: number;
  total: number | null;
  thru: number | null;
  entered_at: string;
}

export interface TourResultMarkRow {
  id: string;
  tournament_id: string;
  team_id: string;
  round_event_id: string | null;
  state: 'final' | 'official' | 'reopened';
  reason: string | null;
  created_at: string;
}

export interface TourReviewRow {
  tournament_id: string;
  team_id: string;
  observation: string | null;
  hypothesis: string | null;
  evidence: unknown;
  updated_at: string;
}

export interface TourPlayerNoteRow {
  tournament_id: string;
  team_id: string;
  player_id: string;
  shot_of_day: string | null;
  decision: string | null;
  next_focus: string | null;
  shared_at: string | null;
  updated_at: string;
}

export interface TourReflectionRow {
  tournament_id: string;
  team_id: string;
  player_id: string;
  body: string;
  updated_at: string;
}

export interface TourAdviceGiverRow {
  tournament_id: string;
  team_id: string;
  user_id: string;
}

export interface TourTeamSeasonRow {
  team_id: string;
  season: string;
  division: 'd1' | 'd2' | 'd3' | 'naia' | 'njcaa' | 'other' | null;
  conference: string | null;
  official_rank: number | null;
  official_rank_at: string | null;
}

export interface TourLinkDismissalRow {
  team_id: string;
  round_id: string;
  dismissed_at: string;
}

/** The rows `golf_tournament_link_candidates(team)` returns (100200). */
export interface TourLinkCandidateRow {
  round_id: string;
  player_id: string;
  round_date: string;
  course_id: string | null;
  course_name: string | null;
  total_score: number | null;
  holes_played: number | null;
  score_to_par: number | null;
  round_type: string | null;
}

/** Column lists, so a select names exactly what the row type above declares. */
export const TOUR_COLUMNS = {
  golf_tournaments:
    'id, team_id, name, start_date, end_date, course_id, format, players_per_team, counting, holes_per_round, rounds_count, event_kind, tiebreak, field_size, line_kind, line_value, substitutions, lock_minutes, lineup_locked_at, lineup_published_at, official_at, results_url, host, created_by, created_at, updated_at, version',
  golf_tournament_rounds: 'round_event_id, tournament_id, team_id, round_number, course_id, tee_id, start_type, first_tee_at, status, status_changed_at, event_adopted',
  golf_tournament_entries: 'tournament_id, team_id, player_id, role, slot',
  golf_tournament_round_lineups: 'round_event_id, team_id, player_id, role, slot, substituted_for, substituted_at',
  golf_tournament_player_rounds: 'round_event_id, team_id, player_id, round_id, entered_total, entered_front, entered_back, status, wd_after_hole, link_source, note, updated_at',
  golf_tournament_field_teams: 'id, tournament_id, team_id, name, is_us, is_b_team, same_division, seed, final_place, final_place_tied, final_total',
  golf_tournament_field_scores: 'field_team_id, team_id, round_number, total, thru, entered_at',
  golf_tournament_result_marks: 'id, tournament_id, team_id, round_event_id, state, reason, created_at',
  golf_tournament_reviews: 'tournament_id, team_id, observation, hypothesis, evidence, updated_at',
  golf_tournament_player_notes: 'tournament_id, team_id, player_id, shot_of_day, decision, next_focus, shared_at, updated_at',
  golf_tournament_reflections: 'tournament_id, team_id, player_id, body, updated_at',
  golf_tournament_advice_givers: 'tournament_id, team_id, user_id',
  golf_team_seasons: 'team_id, season, division, conference, official_rank, official_rank_at',
  golf_tournament_link_dismissals: 'team_id, round_id, dismissed_at',
} as const satisfies Partial<Record<TourTableName, string>>;

/** A row as the generated types spell one: a type alias (an interface has no index signature, so PostgREST's typing refuses it). */
type Plain<T> = { [K in keyof T]: T[K] };
/** `Writes` are columns the actions write but no loader reads (who wrote it), so they stay off the read rows. */
type HeldTable<Row, Writes = unknown> = { Row: Plain<Row>; Insert: Partial<Plain<Row & Writes>>; Update: Partial<Plain<Row & Writes>>; Relationships: [] };

/** The held tables the loaders and actions touch, in `src/lib/types/database.ts`'s shape, until `db:types` covers them. */
export type TourDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.15' };
  public: {
    Tables: {
      golf_tournaments: HeldTable<TourRow>;
      golf_tournament_rounds: HeldTable<TourRoundRow>;
      golf_tournament_entries: HeldTable<TourEntryRow>;
      golf_tournament_round_lineups: HeldTable<TourRoundLineupRow>;
      golf_tournament_player_rounds: HeldTable<TourPlayerRoundRow, { updated_by: string | null }>;
      golf_tournament_field_teams: HeldTable<TourFieldTeamRow>;
      golf_tournament_field_scores: HeldTable<TourFieldScoreRow>;
      golf_tournament_result_marks: HeldTable<TourResultMarkRow>;
      golf_tournament_reviews: HeldTable<TourReviewRow, { updated_by: string | null }>;
      golf_tournament_player_notes: HeldTable<TourPlayerNoteRow>;
      golf_tournament_reflections: HeldTable<TourReflectionRow>;
      golf_tournament_advice_givers: HeldTable<TourAdviceGiverRow>;
      golf_team_seasons: HeldTable<TourTeamSeasonRow>;
      golf_tournament_link_dismissals: HeldTable<TourLinkDismissalRow, { dismissed_by: string | null }>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
export type TourTypedTable = keyof TourDatabase['public']['Tables'];

/** A held tournament table, on the caller's client typed with `TourDatabase` (until `db:types` runs after the apply). */
export function tourTable<T extends TourTypedTable>(supabase: object, table: T) {
  return (supabase as SupabaseClient<TourDatabase>).from(table);
}
