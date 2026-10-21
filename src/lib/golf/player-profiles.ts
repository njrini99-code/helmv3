import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkIds } from '@/lib/supabase/chunk-ids';

/**
 * How a player reads a teammate: the display columns only, through the
 * `golf_player_profiles` function (security review S4, 2026-10-16).
 *
 * `golf_players_select` let a player read a teammate's whole row, email, phone,
 * gpa, high school, hometown and state included. Those columns are now for the
 * player and their coaches (20261017005000 drops the teammate branch), and
 * every read that shows a teammate (rosters, leaderboards, RSVP lists,
 * attendance, messages) goes through here instead of the table or an embed.
 *
 * The function admits the same people the table's policy admitted before
 * (self, the team's coaches, a coach with the player's pending join request, a
 * teammate, an admin), so a coach can use it too.
 *
 * Until 20261017004000 is applied the function does not exist; the read then
 * falls back to the table, which still admits teammates, so this code can ship
 * before the migration. 20261017005000 refuses to apply without the function.
 */

/** The columns a teammate may see. Nothing else is returned. */
export const GOLF_PLAYER_PROFILE_COLUMNS =
  'id, user_id, first_name, last_name, avatar_url, graduation_year, handicap, handicap_index';

export interface GolfPlayerProfile {
  id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
  handicap_index: number | null;
}

export type GolfPlayerProfilesResult =
  | { data: GolfPlayerProfile[]; error: null }
  | { data: null; error: { message: string; code?: string | null } };

/** Any Supabase client: the server's, the browser's, typed or not. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;
type ReadError = { message: string; code?: string | null };

/** ids per call: under PostgREST's 1,000-row cap, and (for the fallback) its URL limit. */
const RPC_CHUNK = 500;
const FALLBACK_CHUNK = 200;
/** Teams per call: a roster is tens of players, so ten teams stay well under the row cap. */
const TEAM_CHUNK = 10;

type Key = 'p_player_ids' | 'p_user_ids' | 'p_team_ids';
type Rows = { data: GolfPlayerProfile[] | null; error: ReadError | null };

/** PostgREST's "no such function in the schema cache", and Postgres's own. */
function isMissingFunction(error: ReadError): boolean {
  return error.code === 'PGRST202' || error.code === '42883';
}

async function rpcChunk(supabase: Client, key: Key, ids: string[]): Promise<Rows> {
  // Not in the generated types until the migration is applied in production.
  return (await supabase.rpc('golf_player_profiles' as never, { [key]: ids } as never)) as unknown as Rows;
}

/** The read this replaces, for while the function is not applied (the table still admits teammates then). */
async function tableChunk(supabase: Client, key: Key, ids: string[]): Promise<Rows> {
  if (key === 'p_team_ids') {
    const res = (await supabase
      .from('golf_team_members')
      .select(`player:golf_players(${GOLF_PLAYER_PROFILE_COLUMNS})`)
      .in('team_id', ids)) as unknown as { data: Array<{ player: GolfPlayerProfile | null }> | null; error: ReadError | null };
    if (res.error) return { data: null, error: res.error };
    return { data: (res.data ?? []).flatMap((m) => (m.player ? [m.player] : [])), error: null };
  }
  const column = key === 'p_user_ids' ? 'user_id' : 'id';
  return (await supabase.from('golf_players').select(GOLF_PLAYER_PROFILE_COLUMNS).in(column, ids)) as unknown as Rows;
}

/**
 * The display profiles the signed-in person may see, of the given players
 * (`playerIds`), accounts (`userIds`), or everyone on the given teams' rosters
 * (`teamIds`, any membership status: filter by status from the roster read).
 * Players they may not see are simply absent. An empty list makes no request.
 * A failed read is an error, never an empty list.
 */
export async function readGolfPlayerProfiles(
  supabase: Client,
  by: { playerIds: readonly string[] } | { userIds: readonly string[] } | { teamIds: readonly string[] },
): Promise<GolfPlayerProfilesResult> {
  const [key, list]: [Key, readonly string[]] =
    'userIds' in by ? ['p_user_ids', by.userIds] : 'teamIds' in by ? ['p_team_ids', by.teamIds] : ['p_player_ids', by.playerIds];
  const ids = [...new Set(list.filter(Boolean))];
  if (ids.length === 0) return { data: [], error: null };

  const seen = new Set<string>();
  const out: GolfPlayerProfile[] = [];
  const keep = (rows: GolfPlayerProfile[] | null) => {
    for (const p of rows ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  };
  let useTable = false;
  for (const chunk of chunkIds(ids, key === 'p_team_ids' ? TEAM_CHUNK : RPC_CHUNK)) {
    if (!useTable) {
      const { data, error } = await rpcChunk(supabase, key, chunk);
      if (!error) {
        keep(data);
        continue;
      }
      if (!isMissingFunction(error)) return { data: null, error };
      useTable = true;
    }
    for (const part of chunkIds(chunk, FALLBACK_CHUNK)) {
      const { data, error } = await tableChunk(supabase, key, part);
      if (error) return { data: null, error };
      keep(data);
    }
  }
  return { data: out, error: null };
}

/** Profiles keyed by player id. */
export function profilesById(rows: readonly GolfPlayerProfile[]): Map<string, GolfPlayerProfile> {
  return new Map(rows.map((p) => [p.id, p]));
}

/** Profiles keyed by account (user) id; rows with no account are left out. */
export function profilesByUserId(rows: readonly GolfPlayerProfile[]): Map<string, GolfPlayerProfile> {
  const map = new Map<string, GolfPlayerProfile>();
  for (const p of rows) if (p.user_id) map.set(p.user_id, p);
  return map;
}
