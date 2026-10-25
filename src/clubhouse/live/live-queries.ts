import type { SupabaseClient } from '@supabase/supabase-js';
import { readGolfPlayerProfiles } from '@/lib/golf/player-profiles';
import { liveTable } from '@/lib/supabase/query-shape';
import { laneFromLiveRow, laneFromPollRow, type GolfRoundLiveRow, type LiveRoster, type PollRoundRow } from './live-rounds-adapter';
import { isoDay } from '../lib/dates';
import { EMPTY_SNAPSHOT, viewerWithheld, type LiveEventRow, type LiveLane, type LiveSnapshot } from './model';

/**
 * The reads behind every live surface, written against any Supabase client so the server loader (first paint) and the
 * browser hook (the 20 second poll) run the same queries under the viewer's own session and RLS. Shot tracking is not
 * touched: these only read what the save path already wrote.
 */

export type LiveClient = SupabaseClient;
type ReadError = { message?: string; code?: string | null } | null;

/** The table (or function) comes with a held migration: "not there" is the expected answer until it is applied. */
const MISSING_CODES: ReadonlySet<string> = new Set(['42P01', 'PGRST205', 'PGRST202']);
export const isMissing = (error: ReadError): boolean => !!error && MISSING_CODES.has(String(error.code));

export const LIVE_COLUMNS =
  'round_id, team_id, player_id, round_type, qualifier_id, qualifier_round, round_date, course_id, course_name, holes_planned, start_position, current_hole, share, phase, thru, to_par, strokes, holes, last_hole_at, heard_at, started_at, ended_at, seq';

/** The v0 read (8.14): the round, its hole plan and the scored holes in one request. */
export const POLL_COLUMNS =
  'id, player_id, team_id, round_type, qualifier_id, qualifier_round_number, round_date, course_id, course_name, holes_played, current_hole, status, created_at, updated_at, plan:draft_data->holes, start_hole:draft_data->startHole, golf_holes(hole_number, par, score, yardage)';

/** A calendar day (YYYY-MM-DD) in a named zone, `minusDays` back. The team's day, never the server's UTC one. */
export function dayInZone(now: Date, zone: string, minusDays = 0): string {
  const t = new Date(now.getTime() - minusDays * 86_400_000);
  try {
    return isoDay(t, zone);
  } catch {
    return t.toISOString().slice(0, 10);
  }
}

export type LiveRead<T> = { rows: T[]; absent: boolean; error: boolean };

/** Today's and yesterday's rows of the live table that this viewer's RLS lets through. */
export async function readLiveTable(supabase: LiveClient, a: { teamId: string; sinceDate: string }): Promise<LiveRead<GolfRoundLiveRow>> {
  const { data, error } = await liveTable<GolfRoundLiveRow>(supabase, 'golf_round_live').select(LIVE_COLUMNS).eq('team_id', a.teamId).gte('round_date', a.sinceDate);
  if (error) return { rows: [], absent: isMissing(error), error: !isMissing(error) };
  return { rows: (data ?? []) as GolfRoundLiveRow[], absent: false, error: false };
}

/** v0: the team's qualifier and tournament rounds that are in progress, or finished today. No practice (OQ-72). */
export async function readPollRounds(supabase: LiveClient, a: { teamId: string; sinceDate: string; today: string }): Promise<LiveRead<PollRoundRow>> {
  const { data, error } = await supabase
    .from('golf_rounds')
    .select(POLL_COLUMNS)
    .eq('team_id', a.teamId)
    .eq('is_test', false)
    .in('round_type', ['qualifier', 'qualifying', 'tournament'])
    .gte('round_date', a.sinceDate)
    .or(`status.eq.in_progress,and(status.in.(completed,abandoned),round_date.eq.${a.today})`);
  if (error) return { rows: [], absent: false, error: true };
  return { rows: (data ?? []) as unknown as PollRoundRow[], absent: false, error: false };
}

/** The player's own rounds in progress (any type), for their own card before the live table exists. */
export async function readOwnPollRounds(supabase: LiveClient, a: { playerId: string; sinceDate: string }): Promise<LiveRead<PollRoundRow>> {
  const { data, error } = await supabase
    .from('golf_rounds')
    .select(POLL_COLUMNS)
    .eq('player_id', a.playerId)
    .eq('is_test', false)
    .eq('status', 'in_progress')
    .not('team_id', 'is', null)
    .gte('round_date', a.sinceDate);
  if (error) return { rows: [], absent: false, error: true };
  return { rows: (data ?? []) as unknown as PollRoundRow[], absent: false, error: false };
}

/**
 * Rounds that a tournament already tracks (open call b): the tournament's own live view shows them. The link table comes
 * with the tournaments migration, so "not there" means nothing is tracked.
 */
export async function readTrackedRoundIds(supabase: LiveClient, roundIds: readonly string[]): Promise<Set<string> | null> {
  if (!roundIds.length) return new Set();
  const { data, error } = await liveTable<{ round_id: string | null }>(supabase, 'golf_tournament_player_rounds').select('round_id').in('round_id', [...roundIds]);
  // The table comes with the tournaments migration: until then nothing is tracked. Any other failure is unknown (null),
  // never "nothing is tracked", which would show a tracked round as a lane.
  if (error) return isMissing(error) ? new Set() : null;
  return new Set(((data ?? []) as Array<{ round_id: string | null }>).flatMap((r) => (r.round_id ? [r.round_id] : [])));
}

/** One row per tournament with a round live right now; the Home card links each to the tournament's live view. */
export async function readLiveEvents(supabase: LiveClient, teamId: string): Promise<LiveEventRow[] | null> {
  const rounds = await liveTable<{ tournament_id: string | null }>(supabase, 'golf_tournament_rounds').select('tournament_id').eq('team_id', teamId).eq('status', 'live');
  if (rounds.error) return isMissing(rounds.error) ? [] : null;
  const ids = [...new Set(((rounds.data ?? []) as Array<{ tournament_id: string | null }>).flatMap((r) => (r.tournament_id ? [r.tournament_id] : [])))];
  if (!ids.length) return [];
  const names = await liveTable<{ id: string; name: string | null }>(supabase, 'golf_tournaments').select('id, name').in('id', ids);
  if (names.error) return null;
  return ((names.data ?? []) as Array<{ id: string; name: string | null }>).map((t) => ({ tournamentId: t.id, name: (t.name ?? '').trim() || 'Tournament' }));
}

/** Names for the players in a set of lanes, through the one function a teammate may use (security review S4). */
export async function readRoster(supabase: LiveClient, playerIds: readonly string[], known: LiveRoster = {}): Promise<{ roster: LiveRoster; error: boolean }> {
  const missing = [...new Set(playerIds)].filter((id) => !(id in known));
  if (!missing.length) return { roster: known, error: false };
  const res = await readGolfPlayerProfiles(supabase, { playerIds: missing });
  if (res.error) return { roster: known, error: true };
  const roster = { ...known };
  for (const p of res.data) roster[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return { roster, error: false };
}

export interface SnapshotArgs {
  teamId: string;
  role: 'coach' | 'player';
  /** The viewer's own golf_players id when they are a player. */
  playerId: string | null;
  now: Date;
  /** The team's zone, for today and yesterday. */
  zone: string;
  /** Names already known; a poll passes the last snapshot's, so only a new player costs a read. */
  roster?: LiveRoster;
  /** The lanes of the last read, so the poll can stamp the time a hole was first seen. */
  prev?: readonly LiveLane[];
}

/**
 * One read of everything a live surface draws. The live table when it exists; otherwise the v0 poll for a coach
 * (qualifier and tournament rounds only) and the player's own rounds for a player. A failed read is flagged
 * (`error`), never taken for "nobody is out".
 */
export async function fetchLiveSnapshot(supabase: LiveClient, a: SnapshotArgs): Promise<LiveSnapshot> {
  const nowIso = a.now.toISOString();
  const today = dayInZone(a.now, a.zone);
  const sinceDate = dayInZone(a.now, a.zone, 1);
  const base = { ...EMPTY_SNAPSHOT(a.teamId), zone: a.zone, fetchedAt: nowIso };
  const prevById = new Map((a.prev ?? []).map((l) => [l.roundId, l]));

  const live = await readLiveTable(supabase, { teamId: a.teamId, sinceDate });
  if (live.error) return { ...base, roster: a.roster ?? {}, error: true };

  let lanes: LiveLane[];
  let source: 'live' | 'poll';
  let roster: LiveRoster = a.roster ?? {};
  let failed: boolean;
  if (!live.absent) {
    source = 'live';
    const names = await readRoster(supabase, live.rows.map((r) => r.player_id), roster);
    roster = names.roster;
    failed = names.error;
    lanes = live.rows.flatMap((r) => {
      const lane = laneFromLiveRow(r, roster);
      return lane ? [lane] : [];
    });
  } else {
    source = 'poll';
    const read = a.role === 'coach' ? await readPollRounds(supabase, { teamId: a.teamId, sinceDate, today }) : a.playerId ? await readOwnPollRounds(supabase, { playerId: a.playerId, sinceDate }) : { rows: [], absent: false, error: false };
    if (read.error) return { ...base, roster, source, error: true };
    // Tournament rounds a tournament tracks are shown by its own live view (open call b).
    const tracked = await readTrackedRoundIds(supabase, read.rows.filter((r) => r.round_type === 'tournament').map((r) => r.id));
    if (tracked === null) return { ...base, roster, source, error: true };
    const rows = read.rows.filter((r) => !tracked.has(r.id));
    const names = await readRoster(supabase, rows.map((r) => r.player_id), roster);
    roster = names.roster;
    failed = names.error;
    lanes = rows.flatMap((r) => {
      const lane = laneFromPollRow(r, roster, prevById.get(r.id), nowIso);
      return lane ? [lane] : [];
    });
  }
  // The privacy rule, in the open: a player with a round on the course sees no teammates' lanes (RLS already withholds them).
  const own = a.playerId ? lanes.find((l) => l.playerId === a.playerId) : undefined;
  const viewerOnCourse = a.role === 'player' && viewerWithheld(own, a.now.getTime());
  const eventRead = a.role === 'coach' ? await readLiveEvents(supabase, a.teamId) : [];
  const events = eventRead ?? [];
  return { teamId: a.teamId, lanes, events, roster, zone: a.zone, fetchedAt: nowIso, source, viewerOnCourse, error: failed || eventRead === null };
}
