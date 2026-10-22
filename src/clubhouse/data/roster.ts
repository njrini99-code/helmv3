import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';
import { chLogServer } from '../lib/track-server';
import { coachTour, earliestStaleFloor, loadCoachHelmGate, loadVisible, newestRounds } from './coachhelm';
import { countReads, type ChReadCount } from './coachhelm-classify';
import { relativeAgo } from '../screens/roster/format';
import { NOTE_TABLE_MISSING_CODES, parseAvailability, type ChAvailability } from './availability';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  classYearLabel,
  displayHandicap,
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
  /** Strokes gained per round by leg over the same rounds as `sgPerRound` (summarizePlayer); null for a leg with too few rounds. */
  sgLegs: { tee: number | null; approach: number | null; around: number | null; putting: number | null };
  trend: number[];
  form: ChForm;
  recent: Array<{ id: string; course: string; date: string; score: number; toPar: number | null }>;
  focusAreas: number | null;
  goals: number | null;
  coachNote: string | null;
  attention: { tone: 'warning' | 'positive'; text: string } | null;
  /**
   * Can they play right now (golf_team_members.availability). Display only, on the coach's roster: it never changes team
   * access, which is `status` (Mark inactive). Inactive players can carry it too. The word comes from the team row; the
   * reason is `availabilityCoachNote`, from a coach-only table, because teammates can read every column of their team's
   * rows (golf_team_members_select_v5), so availability_note is never selected (docs/clubhouse/held/data/roster-availability.md).
   */
  availability: ChAvailability;
  /** When availability last changed (ISO), for "Updated 3 days ago". */
  availabilityUpdated: string | null;
  /** The coach-only reason (at most 280 characters). Null when none, or when the notes table is not there yet. */
  availabilityCoachNote?: string | null;
}

export type { ChAvailability };

export interface ChJoinRequest {
  id: string;
  name: string;
  /** Class, graduation year and age in one line (desktop card). */
  meta: string;
  /** The same parts apart, for the phone sheet. */
  classYear: string | null;
  gradYear: number | null;
  /** "today", "yesterday", "3 days ago". */
  requested: string;
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
  /**
   * The coach-only availability notes can be read and written (golf_player_availability_coach_notes exists and answered).
   * False until its held migration is applied, or when the read failed: the note field is then not drawn, so a blank field
   * can never overwrite a note that could not be read. Absent reads as false.
   */
  availabilityCoachNotes?: boolean;
  statsError: boolean;
  requests: ChJoinRequest[];
  requestsError: boolean;
  /**
   * What CoachHelm reads in each player's rounds (spec D build B): the current reads costing strokes and working, counted by
   * `countReads` as the Board and the coach's Game profile count them. `off`: CoachHelm is off for this coach (the block is not
   * drawn). `failed`: the gate or a read did not load (dashes, CH-3212). A player with no current read is absent from `byPlayer`.
   */
  helm: ChRosterHelm;
}

export type ChRosterHelm = { status: 'on'; byPlayer: Record<string, ChReadCount> } | { status: 'off' } | { status: 'failed' };

const QUIET_DAYS = 9;

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * "Needs a look": deterministic, from data the coach can verify.
 *   quiet     - an active player with no round in 9+ days while the team is posting
 *   slipping  - scoring up by 1.5 or more, newer half of form against older half
 *   hot       - the last four rounds all under their season average
 * A player who is injured or away is not asked about: the coach already knows why (their availability says so).
 */
export function attentionFor(
  s: ReturnType<typeof summarizePlayer>,
  now: Date,
  teamPosting: boolean,
  availability: ChAvailability = 'available',
): ChRosterPlayer['attention'] {
  if (availability !== 'available') return null;
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
      .select('status, jersey_number, joined_at, availability, availability_updated_at, player:golf_players(id, first_name, last_name, graduation_year, hometown, state, high_school_name, handicap, handicap_index)')
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
  type M = {
    status: string | null;
    jersey_number: string | number | null;
    joined_at: string | null;
    availability: string | null;
    availability_updated_at: string | null;
    player: P | null;
  };
  const members = ((membersRes.data ?? []) as M[])
    .filter((m): m is typeof m & { player: P } => m.player !== null);
  const ids = members.map((m) => m.player.id);

  // Rounds, focus areas, goals, this coach's notes and CoachHelm's counts, in parallel.
  const [season, focus, goals, notes, helm, availNotes] = await Promise.all([
    ids.length ? loadSeasonRounds(supabase, ids, { surface: 'roster' }) : Promise.resolve({ rounds: [], error: false }),
    // Open focus areas are `active` or `in_progress`, as Fairway's roster counts them (wiring audit, 2026-10-17).
    countBy('golf_player_focus_areas', ids, (chunk) =>
      supabase.from('golf_player_focus_areas').select('player_id').in('player_id', chunk).in('status', ['active', 'in_progress']),
    ),
    countBy('golf_goals', ids, (chunk) => supabase.from('golf_goals').select('player_id').in('player_id', chunk).eq('state', 'active')),
    loadNotes(supabase, input.coachId, ids),
    loadHelm(supabase, input, ids),
    loadAvailabilityNotes(supabase, input.teamId),
  ]);
  const byPlayer = groupByPlayer(season.rounds);
  const teamPosting = season.rounds.some((r) => daysBetween(now, new Date(`${r.round_date.slice(0, 10)}T12:00:00Z`)) < QUIET_DAYS);

  const players: ChRosterPlayer[] = members.map((m) => {
    const p = m.player;
    const s = summarizePlayer(byPlayer.get(p.id) ?? []);
    const status = m.status === 'inactive' ? 'inactive' : 'active';
    const availability: ChAvailability = parseAvailability(m.availability);
    return {
      id: p.id,
      name: fullName(p),
      firstName: p.first_name || fullName(p),
      classYear: classYearLabel(p.graduation_year, now),
      gradYear: p.graduation_year,
      hometown: [p.hometown, p.state].filter(Boolean).join(', ') || null,
      highSchool: p.high_school_name,
      jersey: m.jersey_number != null && `${m.jersey_number}` !== '' ? `${m.jersey_number}` : null,
      handicap: displayHandicap(p),
      status,
      joined: m.joined_at
        ? `Joined ${new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(m.joined_at))}`
        : null,
      rounds: s.rounds,
      avg: s.avg,
      sgPerRound: s.sgPerRound,
      sgLegs: s.sgLegs,
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
      attention: status === 'active' && !season.error ? attentionFor(s, now, teamPosting, availability) : null,
      availability,
      availabilityUpdated: m.availability_updated_at,
      availabilityCoachNote: availNotes.notes.get(p.id) ?? null,
    };
  });

  const requests: ChJoinRequest[] = (requestsRes.success ? (requestsRes.data ?? []) : [])
    .filter((r) => r.status === 'pending')
    .map((r) => {
      const gradYear = r.player?.graduation_year ?? null;
      const classYear = classYearLabel(gradYear, now);
      const requested = relativeAgo(r.created_at, now);
      return {
        id: r.id,
        name: r.player ? fullName(r.player) : 'A player',
        meta: [classYear, gradYear ? `Class of ${gradYear}` : null, `requested ${requested}`].filter(Boolean).join(' · '),
        classYear,
        gradYear,
        requested,
        handicap: r.player?.handicap ?? null,
      };
    });

  return {
    teamName: teamRes.data?.name ?? 'Your team',
    season: teamRes.data?.season ?? null,
    joinCode: teamRes.data?.join_code ?? null,
    teamError: !!teamRes.error,
    players,
    playersError: !!membersRes.error,
    notesError: notes.error,
    availabilityCoachNotes: availNotes.ready,
    statsError: season.error,
    requests,
    requestsError: !requestsRes.success,
    helm,
  };
}

/**
 * CoachHelm's counts for the roster: the coach's gate, then one visible-rows read for every member (the Board's own read, which
 * records nothing as shown), the team's Tour and each player's newest round, counted per player by `countReads`. The ids are this
 * coach's own team membership rows, read through the session's client (RLS as for the Board). Never throws.
 */
async function loadHelm(supabase: Supabase, input: { teamId: string; coachId: string }, ids: string[]): Promise<ChRosterHelm> {
  try {
    const gate = await loadCoachHelmGate(input.coachId);
    if (gate.status === 'failed') return { status: 'failed' };
    if (gate.status === 'off') return { status: 'off' };
    if (ids.length === 0) return { status: 'on', byPlayer: {} };
    const [visible, tour] = await Promise.all([loadVisible(supabase, ids), coachTour(supabase, input.teamId)]);
    // A missing Tour reads cohort comparisons as findings, so the counts would be wrong: fail rather than count (as the Board does).
    if (visible.error || tour.error) return { status: 'failed' };
    const members = new Set(ids);
    const rows = visible.rows.filter((r) => members.has(r.player_id));
    const newest = await newestRounds(supabase, ids, earliestStaleFloor(rows));
    if (newest.error) return { status: 'failed' };
    const byPlayer: Record<string, ChReadCount> = {};
    for (const id of ids) {
      const count = countReads(
        rows.filter((r) => r.player_id === id),
        tour.baseline,
        newest.days.get(id) ?? null,
      );
      if (count.costing + count.working > 0) byPlayer[id] = count;
    }
    return { status: 'on', byPlayer };
  } catch (err) {
    chLogServer('roster', 'coachhelm', err, 'coachhelm');
    return { status: 'failed' };
  }
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

/**
 * The coach-only reasons beside Injured or Away. The table comes with a held migration, so "not there" is the expected answer
 * until it is applied: `ready` is false, nothing is logged, and the note field is not drawn. Any other failure is logged and
 * also leaves the field off.
 */
async function loadAvailabilityNotes(supabase: Supabase, teamId: string): Promise<{ notes: Map<string, string>; ready: boolean }> {
  const out = new Map<string, string>();
  const { data, error } = await fromUntyped(supabase, 'golf_player_availability_coach_notes').select('player_id, note').eq('team_id', teamId);
  if (error) {
    if (!NOTE_TABLE_MISSING_CODES.has(String(error.code))) chLogServer('roster', 'availabilityCoachNotes', error);
    return { notes: out, ready: false };
  }
  for (const r of (data ?? []) as Array<{ player_id: string; note: string | null }>) if (r.note) out.set(r.player_id, r.note);
  return { notes: out, ready: true };
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
