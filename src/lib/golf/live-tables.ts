/** Live-round tables (20261025050000, applied to production 2026-10-25), typed from the generated database types. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/** `public.golf_round_live`, as PostgREST returns it: the generated row with its JSON and bigint columns given their real shape. */
export interface GolfRoundLiveRow {
  round_id: string;
  team_id: string;
  player_id: string;
  round_type: string;
  qualifier_id: string | null;
  qualifier_round: number | null;
  round_date: string;
  course_id: string | null;
  course_name: string | null;
  holes_planned: number;
  start_position: number;
  current_hole: number | null;
  share: string;
  phase: string;
  thru: number;
  to_par: number | null;
  strokes: number | null;
  holes: Array<{ n: number; p: number | null; y: number | null; s: number | null; at: string | null }> | null;
  last_hole_at: string | null;
  heard_at: string;
  started_at: string | null;
  ended_at: string | null;
  seq: number | string;
}

type GeneratedLiveRow = Database['public']['Tables']['golf_round_live']['Row'];
// Fails the build if the generated row and the narrowed interface above drift apart (a column added, removed or retyped).
type _LiveRowMatchesGenerated = {
  [K in keyof GolfRoundLiveRow]: K extends keyof GeneratedLiveRow ? true : never;
};
const _liveRowKeys: _LiveRowMatchesGenerated | null = null;
void _liveRowKeys;

const liveBuilder = (client: SupabaseClient<Database>) => client.from('golf_round_live');
const livePrefsBuilder = (client: SupabaseClient<Database>) => client.from('golf_round_live_prefs');
type LiveBuilder = ReturnType<typeof liveBuilder>;
type LivePrefsBuilder = ReturnType<typeof livePrefsBuilder>;

/** Uses the caller's session and RLS. */
export function liveTable(client: object, table: 'golf_round_live'): LiveBuilder;
export function liveTable(client: object, table: 'golf_round_live_prefs'): LivePrefsBuilder;
export function liveTable(client: object, table: 'golf_round_live' | 'golf_round_live_prefs'): LiveBuilder | LivePrefsBuilder {
  const typed = client as SupabaseClient<Database>;
  return table === 'golf_round_live' ? liveBuilder(typed) : livePrefsBuilder(typed);
}
