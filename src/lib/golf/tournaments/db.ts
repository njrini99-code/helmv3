/**
 * Hand-written types for 4.33's held tournament tables and P-5's held RPCs, until they are applied and
 * `npm run db:types` puts them in src/lib/types/database.ts (then delete this file in the same change). Every read and
 * write goes through `tourTable` / `tourRpc`, so the escape from the generated types stays in one place.
 *
 * Shapes follow the migrations as written: 4.33's 20261024100000 (tables), and P-5's 20261025040000 (request_id,
 * course_label, golf_team_timezone and the four RPCs, with their jsonb returns).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromUntyped } from '@/lib/supabase/untyped';

export type TourRoundStatus = 'upcoming' | 'live' | 'suspended_weather' | 'suspended_other' | 'final';
export type TourStartType = 'tee_times' | 'shotgun' | 'two_tees';

/** golf_tournaments (4.33), plus P-5's request_id. */
export interface GolfTournamentRow {
  id: string;
  team_id: string;
  name: string;
  start_date: string;
  end_date: string;
  course_id: string | null;
  format: '5c4' | '6c5' | '6c4' | 'custom' | 'match' | 'medal_match' | 'individual';
  players_per_team: number;
  counting: number;
  holes_per_round: 9 | 18;
  rounds_count: number;
  event_kind: 'regular' | 'conference' | 'ncaa_regional' | 'ncaa_championship' | 'exhibition';
  lock_minutes: number;
  lineup_locked_at: string | null;
  lineup_published_at: string | null;
  official_at: string | null;
  results_url: string | null;
  host: string | null;
  field_size: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  /** P-5 20261025040000. */
  request_id: string | null;
}

/** golf_tournament_rounds (4.33), plus P-5's course_label. */
export interface GolfTournamentRoundRow {
  round_event_id: string;
  tournament_id: string;
  team_id: string;
  round_number: number;
  course_id: string | null;
  tee_id: string | null;
  start_type: TourStartType;
  first_tee_at: string | null;
  status: TourRoundStatus;
  status_changed_at: string;
  event_adopted: boolean;
  /** P-5 20261025040000: a course typed by hand. */
  course_label: string | null;
}

/** golf_tournament_entries (4.33). */
export interface GolfTournamentEntryRow {
  tournament_id: string;
  team_id: string;
  player_id: string;
  role: 'lineup' | 'alternate' | 'individual';
  slot: number | null;
}

export type TourTable = 'golf_tournaments' | 'golf_tournament_rounds' | 'golf_tournament_entries' | 'golf_tournament_player_rounds';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

/** A tournament table that is not in the generated types yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tourTable(client: AnyClient, table: TourTable): any {
  return fromUntyped(client, table);
}

/** golf_tournament_create_from_calendar(p jsonb). */
export interface CreateFromCalendarRpcArgs {
  p: {
    team_id: string;
    request_id: string;
    name: string;
    from_event_id?: string;
    course_id?: string;
    course_label?: string;
    format: GolfTournamentRow['format'];
    players_per_team?: number;
    counting?: number;
    holes_per_round: 9 | 18;
    event_kind?: GolfTournamentRow['event_kind'];
    field_size?: number;
    host?: string;
    results_url?: string;
    rounds: Array<{ date: string; start_at: string; end_at?: string | null; all_day: boolean; start_type?: TourStartType; course_id?: string; course_label?: string; tee_id?: string; event_id?: string }>;
    event: { description?: string; requires_rsvp?: boolean; rsvp_deadline?: string; attendee_ids?: string[] };
    qualifier_id?: string;
    itinerary_id?: string;
    entries?: Array<{ player_id: string; role: GolfTournamentEntryRow['role']; slot: number | null }>;
  };
}
export interface CreateFromCalendarRpcResult {
  tournament_id: string;
  version: number;
  replayed: boolean;
  rounds: Array<{ round_number: number; event_id: string }>;
}

/** golf_tournament_update_round(p_round_event_id, p jsonb, p_expected_version). */
export interface UpdateRoundRpcArgs {
  p_round_event_id: string;
  p: {
    start_at?: string;
    end_at?: string | null;
    all_day?: boolean;
    start_type?: TourStartType;
    description?: string | null;
    requires_rsvp?: boolean;
    rsvp_deadline?: string | null;
    shift_tee_sheet?: boolean;
    attendee_ids?: string[];
  };
  p_expected_version: number;
}
export interface UpdateRoundRpcResult {
  version: number;
  tee_times_shifted: number;
  added_player_ids: string[];
}

/** golf_tournament_set_cancelled(...). `p_round_event_id` null is the whole tournament. */
export interface SetCancelledRpcArgs {
  p_tournament_id: string;
  p_round_event_id: string | null;
  p_cancelled: boolean;
  p_reason: string | null;
  p_expected_version: number;
}
export interface SetCancelledRpcResult {
  version: number;
  changed_event_ids: string[];
}

/** golf_tournament_untrack(p_tournament_id, p_expected_version) returns void. */
export interface UntrackRpcArgs {
  p_tournament_id: string;
  p_expected_version: number;
}

export interface TourRpcs {
  golf_tournament_create_from_calendar: { args: CreateFromCalendarRpcArgs; result: CreateFromCalendarRpcResult };
  golf_tournament_update_round: { args: UpdateRoundRpcArgs; result: UpdateRoundRpcResult };
  golf_tournament_set_cancelled: { args: SetCancelledRpcArgs; result: SetCancelledRpcResult };
  golf_tournament_untrack: { args: UntrackRpcArgs; result: null };
  golf_team_timezone: { args: { p_team_id: string }; result: string };
}

/** Call a P-5 RPC that is not in the generated types yet. */
export async function tourRpc<K extends keyof TourRpcs>(
  client: AnyClient,
  name: K,
  args: TourRpcs[K]['args'],
): Promise<{ data: TourRpcs[K]['result'] | null; error: { code?: string; message: string; details?: string | null } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client as any).rpc(name, args);
  return { data: (res?.data ?? null) as TourRpcs[K]['result'] | null, error: res?.error ?? null };
}
