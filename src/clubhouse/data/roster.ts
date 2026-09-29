import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';
import { chLogServer } from '../lib/track-server';
import {
  classYearLabel,
  fullName,
  groupByPlayer,
  loadSeasonRounds,
  shortDate,
  summarizePlayer,
  type ChForm,
} from './season';

/**
 * Coach Roster (Clubhouse). Server-read, final on first paint, every section
 * with its own failure flag. Permissions are the existing ones: RLS-scoped
 * reads, and join requests through getTeamJoinRequests (coach team only).
 */

export interface ChRosterPlayer {
  id: string;
  name: string;
  firstName: string;
  classYear: string | null;
  gradYear: number | null;
  hometown: string | null;
  highSchool: string | null;
  jersey: string | null;
  handicap: number | null;
  status: 'active' | 'inactive';
  joined: string | null;
  rounds: number;
  avg: number | null;
  sgPerRound: number | null;
  trend: number[];
  form: ChForm;
  recent: Array<{ id: string; course: string; date: string; score: number; toPar: number | null }>;
  focusAreas: number | null;
  goals: number | null;
  coachNote: string | null;
  attention: { tone: 'warning' | 'positive'; text: string } | null;
}

export interface ChJoinRequest {
  id: string;
  name: string;
  meta: string;
  handicap: number | null;
}

export interface ChRoster {
  teamName: string;
  season: string | null;
  joinCode: string | null;
  /** The team row didn't load: the name falls back and the join code is unknown, not missing. */
  teamError: boolean;
  players: ChRosterPlayer[];
  playersError: boolean;
  /** This coach's notes didn't load: note fields are locked so a blank field can't overwrite one. */
  notesError: boolean;
  statsError: boolean;
  requests: ChJoinRequest[];
  requestsError: boolean;
}

const QUIET_DAYS = 9;

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function relativeAgo(iso: string, now: Date): string {
  const d = daysBetween(now, new Date(iso));
  if (d <= 0) return 'requested today';
  if (d === 1) return 'requested yesterday';
  return `requested ${d} days ago`;
}

/**
 * "Needs a look": deterministic, from data the coach can verify.
 *   quiet     - an active player with no round in 9+ days while the team is posting
 *   slipping  - scoring up by 1.5 or more, newer half of form against older half
 *   hot       - the last four rounds all under their season average
 */
export function attentionFor(
  s: ReturnType<typeof summarizePlayer>,
  now: Date,
  teamPosting: boolean,
): ChRosterPlayer['attention'] {
  if (teamPosting && s.lastRoundDate) {
    const days = daysBetween(now, new Date(`${s.lastRoundDate.slice(0, 10)}T12:00:00Z`));
    if (days >= QUIET_DAYS) return { tone: 'warning', text: `No rounds in ${days} days` };
  }
  if (s.formChange != null && s.formChange >= 1.5) {
    return { tone: 'warning', text: `Scoring up ${s.formChange.toFixed(1)}` };
  }
  const last4 = s.recent.slice(0, 4).map((r) => r.total_score as number);
  if (s.avg != null && s.rounds >= 8 && last4.length === 4 && last4.every((x) => x < s.avg!)) {
    return { tone: 'positive', text: '4 rounds under average' };
  }
  return null;
}

export async function loadRoster(input: { teamId: string; coachId: string }): Promise<ChRoster> {
  const supabase = await createClient();
  const now = new Date();

  const [teamRes, membersRes, requestsRes] = await Promise.all([
    supabase.from('golf_teams').select('name, join_code, season').eq('id', input.teamId).maybeSingle(),
    supabase
      .from('golf_team_members')
      .select('status, jersey_number, joined_at, player:golf_players(id, first_name, last_name, graduation_year, hometown, state, high_school_name, handicap, handicap_index)')
      .eq('team_id', input.teamId)
      .in('status', ['active', 'inactive']),
    getTeamJoinRequests().catch((e: unknown) => ({ success: false as const, error: e instanceof Error ? e.message : String(e), data: undefined })),
  ]);

  if (teamRes.error) chLogServer('roster', 'team', teamRes.error, 'teams');
  if (membersRes.error) chLogServer('roster', 'members', membersRes.error, 'teams');
  if (!requestsRes.success) chLogServer('roster', 'joinRequests', requestsRes.error ?? 'unknown', 'teams');

  type P = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    graduation_year: number | null;
    hometown: string | null;
    state: string | null;
    high_school_name: string | null;
    handicap: number | null;
    handicap_index: number | null;
  };
  const members = ((membersRes.data ?? []) as Array<{ status: string | null; jersey_number: string | number | null; joined_at: string | null; player: P | null }>)
    .filter((m): m is typeof m & { player: P } => m.player !== null);
  const ids = members.map((m) => m.player.id);

  // Rounds, focus areas, goals and this coach's notes, in parallel.
  const [season, focus, goals, notes] = await Promise.all([
    ids.length ? loadSeasonRounds(supabase, ids, { surface: 'roster' }) : Promise.resolve({ rounds: [], error: false }),
    countBy('golf_player_focus_areas', ids, (chunk) =>
      supabase.from('golf_player_focus_areas').select('player_id').in('player_id', chunk).eq('status', 'active'),
    ),
    countBy('golf_goals', ids, (chunk) => supabase.from('golf_goals').select('player_id').in('player_id', chunk).eq('state', 'active')),
    loadNotes(supabase, input.coachId, ids),
  ]);
  const byPlayer = groupByPlayer(season.rounds);
  const teamPosting = season.rounds.some((r) => daysBetween(now, new Date(`${r.round_date.slice(0, 10)}T12:00:00Z`)) < QUIET_DAYS);

  const players: ChRosterPlayer[] = members.map((m) => {
    const p = m.player;
    const s = summarizePlayer(byPlayer.get(p.id) ?? []);
    const status = m.status === 'inactive' ? 'inactive' : 'active';
    return {
      id: p.id,
      name: fullName(p),
      firstName: p.first_name || fullName(p),
      classYear: classYearLabel(p.graduation_year, now),
      gradYear: p.graduation_year,
      hometown: [p.hometown, p.state].filter(Boolean).join(', ') || null,
      highSchool: p.high_school_name,
      jersey: m.jersey_number != null && `${m.jersey_number}` !== '' ? `${m.jersey_number}` : null,
      handicap: p.handicap_index ?? p.handicap,
      status,
      joined: m.joined_at
        ? `Joined ${new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(m.joined_at))}`
        : null,
      rounds: s.rounds,
      avg: s.avg,
      sgPerRound: s.sgPerRound,
      trend: s.trend,
      form: s.status,
      recent: s.recent.slice(0, 3).map((r) => ({
        id: r.id,
        course: r.course_name ?? 'Course not recorded',
        date: shortDate(r.round_date),
        score: r.total_score as number,
        toPar: r.score_to_par,
      })),
      focusAreas: focus.error ? null : (focus.counts.get(p.id) ?? 0),
      goals: goals.error ? null : (goals.counts.get(p.id) ?? 0),
      coachNote: notes.notes.get(p.id) ?? null,
      attention: status === 'active' && !season.error ? attentionFor(s, now, teamPosting) : null,
    };
  });

  const requests: ChJoinRequest[] = (requestsRes.success ? (requestsRes.data ?? []) : [])
    .filter((r) => r.status === 'pending')
    .map((r) => ({
      id: r.id,
      name: r.player ? fullName(r.player) : 'A player',
      meta: [
        classYearLabel(r.player?.graduation_year ?? null, now),
        r.player?.graduation_year ? `Class of ${r.player.graduation_year}` : null,
        relativeAgo(r.created_at, now),
      ]
        .filter(Boolean)
        .join(' · '),
      handicap: r.player?.handicap ?? null,
    }));

  return {
    teamName: teamRes.data?.name ?? 'Your team',
    season: teamRes.data?.season ?? null,
    joinCode: teamRes.data?.join_code ?? null,
    teamError: !!teamRes.error,
    players,
    playersError: !!membersRes.error,
    notesError: notes.error,
    statsError: season.error,
    requests,
    requestsError: !requestsRes.success,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function countBy(
  table: string,
  ids: string[],
  query: (chunk: string[]) => PromiseLike<{ data: Array<{ player_id: string }> | null; error: unknown }>,
): Promise<{ counts: Map<string, number>; error: boolean }> {
  const counts = new Map<string, number>();
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await query(chunk);
    if (error) {
      chLogServer('roster', table, error);
      return { counts, error: true };
    }
    for (const row of data ?? []) counts.set(row.player_id, (counts.get(row.player_id) ?? 0) + 1);
  }
  return { counts, error: false };
}

async function loadNotes(supabase: Supabase, coachId: string, ids: string[]): Promise<{ notes: Map<string, string>; error: boolean }> {
  const out = new Map<string, string>();
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await supabase
      .from('golf_coach_player_intent')
      .select('player_id, notes')
      .eq('coach_id', coachId)
      .in('player_id', chunk);
    if (error) {
      chLogServer('roster', 'coachNotes', error);
      return { notes: out, error: true };
    }
    for (const r of data ?? []) if (r.notes) out.set(r.player_id, r.notes);
  }
  return { notes: out, error: false };
}
