/**
 * Reads the demo team as a prospect would see it, for the coverage check
 * (`coverage.ts`): every row of the team in the tables the check reads,
 * whether the generator wrote it or not. Read-only.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { DemoRow } from './generate';
import type { CoverageTable, DemoSnapshot } from './coverage';

type Client = SupabaseClient<Database>;
type Table = keyof Database['public']['Tables'];

const PAGE = 1000;
const ID_CHUNK = 200;

/** Loose builder: the snapshot reads many tables the same way, so it trades the per-table types for one helper. */
interface Query {
  select(cols: string): Query;
  eq(col: string, v: unknown): Query;
  in(col: string, vs: unknown[]): Query;
  order(col: string, opts?: { ascending?: boolean }): Query;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

async function readAll(client: Client, table: Table, cols: string, filter: (q: Query) => Query, order = 'id'): Promise<DemoRow[]> {
  const out: DemoRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const q = filter((client.from(table) as unknown as Query).select(cols)).order(order);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    out.push(...((data ?? []) as DemoRow[]));
    if (!data || data.length < PAGE) return out;
  }
}

async function readByIds(client: Client, table: Table, cols: string, col: string, ids: string[]): Promise<DemoRow[]> {
  const out: DemoRow[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    out.push(...(await readAll(client, table, cols, (q) => q.in(col, chunk))));
  }
  return out;
}

const ids = (rows: DemoRow[], k = 'id') => [...new Set(rows.map((r) => String(r[k])))];

/** The team's rows in every table the coverage check reads. */
export async function readDemoSnapshot(client: Client, teamId: string, today: string): Promise<DemoSnapshot> {
  const team = (q: Query) => q.eq('team_id', teamId);
  const members = await readAll(client, 'golf_team_members', '*', team);
  const players = await readByIds(client, 'golf_players', 'id, first_name, last_name, is_test', 'id', ids(members, 'player_id'));
  const rounds = await readAll(client, 'golf_rounds', '*', team);
  const holes = await readByIds(client, 'golf_holes', 'id, round_id, hole_number, par, score, putts, gir, fairway_hit, penalty_strokes', 'round_id', ids(rounds));
  const shots = await readByIds(client, 'golf_shots', 'id, round_id, hole_id, hole_number, shot_number, shot_type', 'round_id', ids(rounds));
  const events = await readAll(client, 'golf_events', '*', team);
  const attendance = await readByIds(client, 'golf_event_attendance', '*', 'event_id', ids(events));
  const qualifiers = await readAll(client, 'golf_qualifiers', '*', team);
  const qualifierEntries = await readByIds(client, 'golf_qualifier_entries', '*', 'qualifier_id', ids(qualifiers));
  const conversations = await readAll(client, 'golf_conversations', 'id', team);
  const messages = await readByIds(client, 'golf_messages', '*', 'conversation_id', ids(conversations));
  const tables: { [K in CoverageTable]: DemoRow[] } = {
    golf_players: players,
    golf_team_members: members,
    golf_team_seasons: await readAll(client, 'golf_team_seasons', '*', team, 'season'),
    golf_rounds: rounds,
    golf_holes: holes,
    golf_shots: shots,
    golf_events: events,
    golf_event_attendance: attendance,
    golf_tournaments: await readAll(client, 'golf_tournaments', '*', team),
    golf_tournament_rounds: await readAll(client, 'golf_tournament_rounds', '*', team, 'round_event_id'),
    golf_tournament_entries: await readAll(client, 'golf_tournament_entries', '*', team, 'tournament_id'),
    golf_qualifiers: qualifiers,
    golf_qualifier_entries: qualifierEntries,
    golf_practice_plans: await readAll(client, 'golf_practice_plans', '*', team),
    golf_tasks: await readAll(client, 'golf_tasks', '*', team),
    golf_announcements: await readAll(client, 'golf_announcements', '*', team),
    golf_messages: messages,
  };
  return { today, tables };
}
