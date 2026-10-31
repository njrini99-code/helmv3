import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';
import { eventDaySpan } from '@/lib/calendar/timezone';
import { chLogServer } from '../lib/track-server';
import { homeClock, ymd } from './home-clock';
import { classYearLabel, fullName, groupByPlayer, isFull18, lastTenFloor, loadSeasonRounds, mean, MIN_SG_ROUNDS, seasonStartDate, summarizePlayer, type ChForm, type ChRound } from './season';
import { LEGS, sgLegs, teamGrid, type ChLeg } from './stats-team';
import { legRows } from './leg-rows';
import { loadCoachQueue, type ChCoachQueue } from './home-queue';
import { teamRankRows, type TeamRankMetric, type TeamRankRow } from '../screens/stats/team-rank';
import type { ChSgTour } from '../lib/sg';
import { hasHoleScores, holeRounds, recordedPutts } from './round-scope';
import { loadRoundCache, previousInFilter, readTourBenchmarks, roundsInFilter, seasonOnly, tourForGender, type ChRoundCache } from './stats-common';
import { filterFor } from './stats-filter';
import { effectiveCount, weightedMean, windowChangeSe } from './stats-weight';
import { changeSe, floorRate } from '../lib/stats-signal';
import { rsvpOf } from './calendar';
import { parseAvailability, type ChAvailability } from './availability';
import { playerMine, playerSeesMeeting, replyClosedAt, type ChRsvp } from '../screens/calendar/model';
import { loadAttendanceCounts, loadInvitedCounts, type ChAttendanceCounts } from './attendance-counts';
import { confirmedLine, daysBetween, homeSubline, inviteDetail } from '../screens/home/model';
import { firstName } from '../lib/names';
import type { MarkEntries } from '../lib/marks-cookie';
import type { ChCalChange } from '../screens/calendar/change-view';
import type { ChHomeChange } from '../screens/home/change-rows';
import { loadHomeChanges, withChange, withWas } from './home-changes';

export { classYearLabel, formStatus } from './season';
export { homeClock } from './home-clock';
export type { ChCoachQueue } from './home-queue';

/**
 * Coach Home (Clubhouse). One server read, final data on first paint.
 *
 * Every section carries its own `error` flag: a failed read renders an inline
 * notice in that section and never an empty state, and never takes down the
 * rest of the page. Nothing here is invented: when a figure has no source
 * it's absent, not approximated (docs/clubhouse/PROGRESS.md, data gaps).
 */

export interface ChHomeDay {
  /** YYYY-MM-DD in the team's timezone. */
  date: string;
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  /** Team events that day, excluding personal class blocks. */
  eventCount: number;
  hasCompetition: boolean;
  /** The day's competition, for its mark (calendar TYPE_ICON): a tournament outranks a qualifier on the same day. */
  competitionType: 'tournament' | 'qualifier' | null;
}

export interface ChAgendaRow {
  id: string;
  /** "3:30" or "All day", or a weekday ("Thu") for rows after today. */
  timeLabel: string;
  /** The start as 24-hour "15:30" in the team's zone (absent for an all-day event), for a device that reads times in 24 hours: the 12-hour label has dropped its AM or PM. */
  hm?: string;
  title: string;
  detail: string | null;
  isNext: boolean;
  isCompetition: boolean;
  /** Today's rows, then competitions later this week. */
  when: 'today' | 'later';
  /** P-14: the old value of a changed event (a live mark), struck at the head of the detail line. */
  was?: { text: string; changeId: string } | null;
}

export interface ChHoleScore {
  n: number;
  par: number | null;
  score: number | null;
}

export interface ChLatestRound {
  id: string;
  playerId: string;
  playerName: string;
  meta: string;
  /** The day it was played, YYYY-MM-DD. */
  date?: string;
  score: number;
  toPar: number | null;
  /** Null when the round was posted as a total, without hole-by-hole detail. */
  holes: ChHoleScore[] | null;
  gir: string | null;
  putts: number | null;
  sg: number | null;
}

export interface ChLeaderRow {
  playerId: string;
  name: string;
  classYear: string | null;
  rounds: number;
  avg: number;
  toPar: number | null;
  /** Oldest to newest, up to seven 18-hole scores. */
  trend: number[];
  /** Null when there are fewer than three rounds with strokes gained. */
  sgPerRound: number | null;
  status: ChForm;
  /** Days since the player's last countable round of any length, in the team's timezone. */
  quietDays: number | null;
  /** That newest countable round, for the player peek ("Last round 74 +2, Pinehurst · Sat 25 Oct"); null with none scored. */
  lastRound?: { score: number; toPar: number | null; label: string } | null;
  /** Injured or away (display only). An out player is not flagged for a quiet stretch. Absent reads as available. */
  availability?: ChAvailability;
}

/** One team event as the phone Home draws it (Up next and Today). */
export interface ChHomeEvent {
  id: string;
  title: string;
  type: 'practice' | 'qualifier' | 'tournament' | 'meeting' | 'travel' | 'other';
  /** Team-local date, YYYY-MM-DD. */
  date: string;
  /** Team clock for relative day labels. Server reads always set it; old fixtures use the product default. */
  timezone?: string;
  startIso: string;
  endIso: string | null;
  allDay: boolean;
  /** "3:30 PM" */
  startLabel: string;
  /** "3:30 – 5:30 PM", or "All day" */
  rangeLabel: string;
  location: string | null;
  /** P-14: what a coach changed on this event in the last 72 hours (a live mark), for Up next. */
  change?: ChCalChange | null;
  /** Invitees' names, in roster order; null when replies didn't load (CH-2209). */
  invitees: string[] | null;
  /**
   * Accepted replies; null when replies or the identities needed for the paired count didn't load, or when the event
   * doesn't ask for replies (`requires_rsvp` off, the default).
   */
  going: number | null;
  /** Invitees who haven't replied (golf_players id and name), for the coach's Nudge; null when replies didn't load. */
  awaiting?: Array<{ id: string; name: string }> | null;
  /** Every invitee's golf_players id, for the coach's Message (prefilled, never sent); null when replies didn't load. */
  inviteeIds?: string[] | null;
  /**
   * How many are invited, for D2-8 (a meeting with no invitees is the coach's own); null when replies didn't load. A
   * player's Home has this without `inviteeIds` (it reads counts, never teammates' rows).
   */
  invitedCount?: number | null;
  /**
   * A player's Home only: their own reply on an event that asks for one. `going` when they said yes; `needed` when it is
   * still theirs to answer (invited, or open to the whole team, and not started or past its deadline). Null otherwise,
   * and when their own reply didn't load.
   */
  mine?: 'going' | 'needed' | null;
  /** Overlaps another of today's timed events. */
  conflict: boolean;
  /** Coach only: the event asks for replies and the server would still take one (not started, not past its deadline). */
  replyOpen?: boolean;
}

/**
 * The team's scoring form (phone Home), on the Stats page's Last 10 basis: each player's newest ten 18-hole
 * rounds this season against each player's ten before (`teamForm`).
 */
export interface ChTeamForm {
  avg: number;
  /** Against each player's previous ten; null when no player has three rounds before their newest ten. */
  delta: number | null;
  /** Each change's standard error (stats visuals Q4): a change is green or amber only when it clears it. Absent: neutral. */
  deltaSe?: number | null;
  /** The team's average on each of its last ten round days (the rounds the average rests on), oldest to newest, for the line. */
  line: number[];
  /** Countable rounds of either length in the team-local Monday-to-Sunday week: a count on its own basis, not the figures'. */
  roundsThisWeek: number;
  /** What the average, greens and putts rest on: the rounds, their first and last dates, and how many carry greens and putts. */
  basis: { rounds: number; from: string; to: string; girRounds: number; puttsRounds: number };
  /** Greens in regulation, percent; delta in points. */
  /** Under its floor (two rounds with greens, A7) the share is null and `needs` says what it needs. */
  gir: { pct: number | null; delta: number | null; se?: number | null; needs?: string };
  /** Per 18 holes, over the rounds with putts recorded (`recordedPutts`: a round written 0 putts has none), as Stats counts them. */
  putts: { avg: number | null; delta: number | null; se?: number | null };
}

/** One of the four parts in "The team's game" (Coach Home, under the team's form; spec B §1). */
export type ChTeamLegKey = 'tee' | 'approach' | 'around' | 'putting';

/** Who gains or loses most in a part: the players sharing that place (ties), first named first, and the first's figure. */
export interface ChLegPeople {
  /** golf_players ids, from the roster's rows only. */
  ids: string[];
  /** "Theo M." */
  names: string[];
  /** Strokes gained per round of the first named. */
  value: number;
}

export interface ChTeamLeg {
  key: ChTeamLegKey;
  /** Team Stats' leg name, verbatim (`LEGS`). */
  label: ChLeg;
  /** The part's plain stat over the same rounds: Fairways, Greens, Up and down (a rate) or Putts (per round), with the Tour's mark. */
  stat: { label: 'Fairways' | 'Greens' | 'Up and down' | 'Putts'; value: number | null; unit: '%' | ''; digits: number; tour: number | null; needs?: string; early?: string };
  /** The team's strokes gained per round in the part over its hole-by-hole rounds; null under MIN_SG_ROUNDS. */
  sg: number | null;
  /** Against each player's previous ten (the same players, Q-112); null with no earlier ten to compare. */
  delta: number | null;
  /** The change's standard error: green or amber only when it clears it. */
  se: number | null;
  gains: ChLegPeople | null;
  /** Null with one ranked player, or when everyone ranked shares one place. */
  loses: ChLegPeople | null;
}

/**
 * The team's four parts, on the form's own Last 10 basis. `holeRounds`: how many of those rounds have their holes scored
 * (none: CH-2314). `ranked`: some player is ranked in some part (none: CH-2315). `cacheError`: up-and-down didn't load
 * (CH-2218). `tourError`: the Tour's marks didn't load (CH-2219); an unknown tour (the team's row didn't load) has no
 * marks and no notice.
 */
export interface ChTeamLegs {
  rows: ChTeamLeg[];
  holeRounds: number;
  ranked: boolean;
  tour: ChSgTour;
  cacheError: boolean;
  tourError: boolean;
}

/** The team's zone and its date when the page was read. */
export interface ChHomeClock {
  tz: string;
  /** YYYY-MM-DD in `tz`. */
  day: string;
}

export interface ChCoachHome {
  /** The team this page is for (P-10: the class line reads its class day). Optional for fixtures. */
  teamId?: string;
  greeting: string;
  /** The team chat to open from "Message team"; null opens Messages. */
  teamChatId: string | null;
  /** Who needs a look and what's next, from the leaderboard and the week. Null when that read failed. */
  subline: string | null;
  todayLabel: string;
  /**
   * The team clock this page was read on: its zone and its date then (YYYY-MM-DD). The client compares the team-local
   * date now against `day` and reads the page again when it has rolled over (useHomeDayRollover). Optional for fixtures.
   */
  clock?: ChHomeClock;
  week: { days: ChHomeDay[]; agenda: ChAgendaRow[]; error: boolean };
  /** holesError: the rounds loaded but their hole-by-hole detail didn't. */
  latestRounds: { rounds: ChLatestRound[]; error: boolean; holesError: boolean };
  leaderboard: { rows: ChLeaderRow[]; scorecards: number; rosterSize: number; error: boolean };
  /** The phone Home's extra reads (docs/clubhouse/phone/home.md). Each follows its source's error flag. */
  phone: {
    /** The next team event from now, today or later in the loaded window. */
    next: ChHomeEvent | null;
    today: ChHomeEvent[];
    /** Null when there are no 18-hole rounds or the rounds didn't load. */
    form: ChTeamForm | null;
    /** The first competition later this week, for the week strip's note. */
    weekNote: { weekday: string; title: string } | null;
  };
  /** The team's four parts under the form (desktop and phone); null when the rounds didn't load or there are none. Optional for fixtures. */
  legs?: ChTeamLegs | null;
  /** What is waiting on the coach (desktop and phone, first run too); each part null when it didn't load. Optional for fixtures. */
  queue?: ChCoachQueue;
  /** P-14: schedule changes other people made in the last 72 hours, newest first, for "Since you last looked". Optional for fixtures. */
  changes?: ChHomeChange[];
  /** Which change marks this device has seen (`s`) or cleared (`g`), from the `ch_marks` cookie. Optional for fixtures. */
  marks?: MarkEntries;
}

const COMPETITION_TYPES = new Set(['tournament', 'qualifier']);

function log(read: string, error: unknown) {
  chLogServer('home', read, error);
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
  return t.toISOString().slice(0, 10);
}

function weekdayIndexMonFirst(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7;
}

/**
 * The week a team-local date falls in (Monday to Sunday), and the instants its events are read between: a day of slack either side
 * covers every UTC offset (rows are bucketed by team-local date afterwards).
 */
export function weekWindow(today: string): { weekStart: string; weekEnd: string; from: number; to: number } {
  const weekStart = addDays(today, -weekdayIndexMonFirst(today));
  const weekEnd = addDays(weekStart, 6);
  return { weekStart, weekEnd, from: new Date(`${addDays(weekStart, -1)}T00:00:00Z`).getTime(), to: new Date(`${addDays(weekEnd, 2)}T00:00:00Z`).getTime() };
}

/**
 * The widest window any timezone's `weekWindow` can be at `now`, so the events can be asked for before the zone is known. A zone's local date
 * is at most a day from the UTC date, so its week starts no earlier than 7 days before the UTC date and its window ends no later than 9
 * days after it: eight days back and ten forward hold every one (home-reads.test.ts walks every zone offset).
 */
export function wideEventWindow(now: Date): { from: string; to: string } {
  const utcToday = ymd(now, 'UTC');
  return { from: `${addDays(utcToday, -8)}T00:00:00Z`, to: `${addDays(utcToday, 10)}T00:00:00Z` };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function loadCoachHome(input: {
  teamId: string;
  coachName: string;
  /** For Team Hub's announcements read (the queue); it reads the session itself. */
  userId?: string;
  /** The coach's own `golf_coaches.id`: their own schedule changes are never news to them (P-14). */
  coachId?: string | null;
  /** The device's seen and cleared change marks (phone-hint.ts `marksHint`). */
  marks?: MarkEntries;
}): Promise<ChCoachHome> {
  const supabase = await createClient();
  const now = new Date();

  // Everything that can start now does, and each later read starts the moment the one it needs has answered, not when its siblings
  // have: the timezone, the roster, the team chat and the week's events go together; the season's rounds follow the roster alone
  // (they used to wait for the events and their replies too); the newest rounds' cards follow the rounds.
  const clockRead = homeClock(supabase, input.teamId, now);
  const coachFirst = firstName(input.coachName) || 'Coach';
  type RosterPlayer = { id: string; first_name: string | null; last_name: string | null; graduation_year: number | null };
  const rosterRead = Promise.resolve(
    supabase.from('golf_team_members').select('availability, player:golf_players(id, first_name, last_name, graduation_year)').eq('team_id', input.teamId).eq('status', 'active'),
  );
  const rosterOf = (res: Awaited<typeof rosterRead>) =>
    ((res.data ?? []) as Array<{ player: RosterPlayer | null }>).map((m) => m.player).filter((p): p is RosterPlayer => p !== null);
  const nameOf = fullName;
  const chatRead = Promise.resolve(
    supabase.from('golf_conversations').select('id').eq('team_id', input.teamId).eq('is_team_chat', true).order('created_at', { ascending: true }).limit(1),
  );
  // The week waits for the roster's names only to label invitees.
  const weekRead = loadHomeWeek(supabase, {
    teamId: input.teamId,
    tz: clockRead.then((c) => c.tz),
    now,
    names: rosterRead.then((res) => new Map(rosterOf(res).map((p) => [p.id, nameOf(p)]))),
  });
  const roundsRead = rosterRead.then(async (res): Promise<Awaited<ReturnType<typeof loadSeasonRounds>>> => {
    const players = rosterOf(res);
    if (res.error || players.length === 0) return { rounds: [], error: !!res.error };
    // The team's form is Stats' Last 10, which reaches back across seasons (Q-122): read as far as it does; the rest of Home is this season.
    return loadSeasonRounds(supabase, players.map((p) => p.id), { surface: 'home', since: lastTenFloor() });
  });
  const playerById = rosterRead.then((res) => new Map(rosterOf(res).map((p) => [p.id, p])));
  // The season turns on 1 August in the team's zone (owner decision 9), the clock's.
  const startRead = clockRead.then((c) => seasonStartDate(now, c.tz));
  const latestRead = Promise.all([roundsRead, playerById, startRead]).then(([res, byId, start]) =>
    latestWithHoles(supabase, seasonOnly(res.rounds.filter(isFull18), start), (id) => {
      const p = byId.get(id);
      return p ? nameOf(p) : 'Former player';
    }),
  );
  // The four parts: the team's tour (its gender, as Player Home reads it) and the Tour's marks; the up-and-down figures of
  // the form's own Last 10 rounds with their holes.
  const teamRead = Promise.resolve(supabase.from('golf_teams').select('gender').eq('id', input.teamId).maybeSingle());
  const benchRead = teamRead.then((team) => (team.error || !team.data ? null : readTourBenchmarks(supabase, tourForGender(team.data.gender), 'home')));
  const cacheRead = roundsRead.then((res) => {
    const ids = res.error ? [] : holeRounds(teamWindows(res.rounds.filter(isFull18)).last).map((r) => r.id);
    return ids.length ? loadRoundCache(supabase, ids, 'home') : { byRound: new Map<string, ChRoundCache>(), error: false };
  });
  // What is waiting on the coach: its own reads, each part on its own.
  const queueRead = loadCoachQueue(supabase, {
    teamId: input.teamId,
    userId: input.userId ?? '',
    now,
    tz: clockRead.then((c) => c.tz),
    names: rosterRead.then((res) => (res.error ? null : new Map(rosterOf(res).map((p) => [p.id, nameOf(p)])))),
  });
  // P-14: the schedule changes, read beside the rest once the team's zone is known.
  const changesRead = loadHomeChanges(supabase, { teamId: input.teamId, tz: clockRead.then((c) => c.tz), now, coachId: input.coachId ?? null });
  const [{ greeting, todayLabel, tz, day }, rosterRes, chatRes, wk, seasonRead, latest, teamRes, bench, cache, queue, changes] = await Promise.all([
    clockRead,
    rosterRead,
    chatRead,
    weekRead,
    roundsRead,
    latestRead,
    teamRead,
    benchRead,
    cacheRead,
    queueRead,
    changesRead,
  ]);
  if (teamRes.error) log('team', teamRes.error);
  // CH-2208: without the team chat, Message team opens Messages instead.
  if (chatRes.error) log('team chat', chatRes.error);

  // ── Roster ──
  if (rosterRes.error) log('roster', rosterRes.error);
  const roster = rosterOf(rosterRes);
  const availabilityById = new Map<string, ChAvailability>();
  for (const m of (rosterRes.data ?? []) as unknown as Array<{ availability: string | null; player: RosterPlayer | null }>) {
    if (m.player) availabilityById.set(m.player.id, parseAvailability(m.availability));
  }
  const { today, weekStart, weekEnd } = wk;

  // ── Season rounds ──
  const { rounds, error: roundsError } = seasonRead;
  const full = rounds.filter(isFull18);
  const start = seasonStartDate(now, tz);
  const seasonRounds = seasonOnly(rounds, start);
  const seasonFull = seasonOnly(full, start);

  // ── Latest rounds with hole-by-hole (read above, as soon as the rounds were in) ──
  const { rounds: latestRounds, holesError } = latest;

  // ── Leaderboard ──
  const byPlayer = groupByPlayer(seasonFull);
  // Recency counts any countable round, nine holes included.
  const lastPlayed = new Map<string, string>();
  for (const r of seasonRounds) if (!lastPlayed.has(r.player_id)) lastPlayed.set(r.player_id, r.round_date.slice(0, 10));
  const peekDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const lastScored = new Map<string, NonNullable<ChLeaderRow['lastRound']>>();
  for (const r of seasonRounds) {
    if (lastScored.has(r.player_id) || r.total_score == null) continue;
    const day = peekDate.format(new Date(`${r.round_date.slice(0, 10)}T12:00:00Z`));
    lastScored.set(r.player_id, { score: r.total_score, toPar: r.score_to_par ?? null, label: [r.course_name, day, r.holes_played != null && r.holes_played < 18 ? `${r.holes_played} holes` : null].filter(Boolean).join(' · ') });
  }
  const rows: ChLeaderRow[] = [];
  for (const p of roster) {
    const list = byPlayer.get(p.id);
    if (!list?.length) continue;
    const season = summarizePlayer(list);
    rows.push({
      playerId: p.id,
      name: nameOf(p),
      classYear: classYearLabel(p.graduation_year, now, tz),
      rounds: season.rounds,
      avg: season.avg ?? 0,
      toPar: season.toPar,
      trend: season.trend,
      sgPerRound: season.sgPerRound,
      status: season.status,
      quietDays: lastPlayed.has(p.id) ? Math.max(0, daysBetween(lastPlayed.get(p.id)!, today)) : null,
      lastRound: lastScored.get(p.id) ?? null,
      availability: availabilityById.get(p.id) ?? 'available',
    });
  }
  // C-24(d): an early read (fewer than three 18-hole rounds) never outranks a player with a sample; ties go to more rounds, then the name.
  const early = (r: ChLeaderRow) => (r.status === 'early' ? 1 : 0);
  rows.sort((a, b) => early(a) - early(b) || a.avg - b.avg || b.rounds - a.rounds || a.name.localeCompare(b.name));

  // ── Phone: the team's form ──
  const form = roundsError ? null : teamForm(full, rounds.filter((r) => r.round_date.slice(0, 10) >= weekStart && r.round_date.slice(0, 10) <= weekEnd).length);
  // ── The team's four parts, on the form's rounds ──
  const legs = form ? teamLegs({ full, players: roster, cache, bench, tour: teamRes.error || !teamRes.data ? null : tourForGender(teamRes.data.gender) }) : null;

  return {
    teamId: input.teamId,
    greeting: `${greeting}, ${coachFirst}`,
    teamChatId: chatRes.error ? null : (chatRes.data?.[0]?.id ?? null),
    subline: homeSubline(rows, { roundsError, nextCompetition: wk.nextCompetition }),
    todayLabel,
    clock: { tz, day },
    week: { ...wk.week, agenda: withWas(wk.week.agenda, changes.byEvent) },
    latestRounds: { rounds: latestRounds, error: roundsError, holesError },
    leaderboard: { rows, scorecards: seasonFull.length, rosterSize: roster.length, error: roundsError },
    phone: { next: withChange(wk.next, changes.byEvent), today: wk.todayEvents.map((e) => withChange(e, changes.byEvent)), form, weekNote: wk.weekNote },
    legs,
    queue,
    changes: changes.rows,
    marks: input.marks ?? [],
  };
}

/**
 * The newest three 18-hole rounds with their hole-by-hole card (null for a
 * round posted as a total). `holesError`: the rounds loaded but the cards
 * didn't, so each shows its totals only.
 */
export async function latestWithHoles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  full: ChRound[],
  nameFor: (playerId: string) => string,
): Promise<{ rounds: ChLatestRound[]; holesError: boolean }> {
  const latest = full.slice(0, 3);
  const holesByRound = new Map<string, ChHoleScore[]>();
  let holesError = false;
  for (const ids of latest.length ? chunkIds(latest.map((r) => r.id)) : []) {
    const { data, error } = await supabase.from('golf_holes').select('round_id, hole_number, par, score').in('round_id', ids).order('hole_number', { ascending: true });
    if (error) {
      log('holes', error);
      holesError = true;
      break;
    }
    for (const h of data ?? []) {
      const list = holesByRound.get(h.round_id) ?? [];
      list.push({ n: h.hole_number, par: h.par, score: h.score });
      holesByRound.set(h.round_id, list);
    }
  }
  const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const rounds = latest.map((r) => {
    const holes = holesByRound.get(r.id);
    return {
      id: r.id,
      playerId: r.player_id,
      playerName: nameFor(r.player_id),
      meta: [r.course_name, dateFmt.format(new Date(`${r.round_date.slice(0, 10)}T12:00:00Z`)), r.tees_played ? `${r.tees_played} tees` : null].filter(Boolean).join(' · '),
      date: r.round_date.slice(0, 10),
      score: r.total_score ?? 0,
      toPar: r.score_to_par,
      holes: holes && holes.length === 18 ? holes : null,
      gir: r.total_gir != null && r.total_gir_possible ? `${r.total_gir}/${r.total_gir_possible}` : null,
      // A round written 0 putts has none recorded (recordedPutts), as on Stats.
      putts: recordedPutts(r.total_putts),
      sg: r.strokes_gained_total,
    };
  });
  return { rounds, holesError };
}

export interface ChHomeWeek {
  /** Team-local YYYY-MM-DD. */
  today: string;
  weekStart: string;
  weekEnd: string;
  week: { days: ChHomeDay[]; agenda: ChAgendaRow[]; error: boolean };
  nextCompetition: { title: string; when: string } | null;
  /** The next team event from now, today or later in the loaded window. */
  next: ChHomeEvent | null;
  todayEvents: ChHomeEvent[];
  /** The first competition later this week, for the week strip's note. */
  weekNote: { weekday: string; title: string } | null;
}

/**
 * The team's week, shared by coach and player Home: the days with their
 * counts, today's agenda and the week's competitions, Up next and Today.
 * Team events only (class blocks are personal). `names` turns invitees into
 * names; a player's Home passes none, so it never lists who else is invited.
 * `viewer: 'player'` reads the reply counts through golf_event_attendance_counts
 * (migration 20261017102000) instead of the rows, so no teammate's id or reply
 * reaches the page; until that function exists it reads the rows as before.
 * With `playerId` it also reads the player's own replies, beside the events:
 * a meeting they aren't invited to is not on their week at all (Decision B),
 * and each event carries their own reply (`mine`).
 */
export async function loadHomeWeek(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    teamId: string;
    tz: string | Promise<string>;
    now: Date;
    names: Map<string, string> | Promise<Map<string, string>>;
    viewer?: 'coach' | 'player';
    /** The player whose Home this is (with `viewer: 'player'`): their own replies decide which meetings they see. */
    playerId?: string | null;
  },
): Promise<ChHomeWeek> {
  const { now } = input;
  // The events are asked for before the team's timezone is known, over a window that holds the week of any zone (`wideEventWindow`),
  // and cut to the exact window below. The window used to wait for the timezone read, which put a round trip in front of the events
  // and the replies after them.
  const wide = wideEventWindow(now);
  const eventsRead = fetchAllRowsResult((from, to) =>
    supabase
      .from('golf_events')
      .select('id, title, event_type, start_time, end_time, all_day, location, requires_rsvp, rsvp_deadline')
      .eq('team_id', input.teamId)
      .neq('event_type', CLASS_EVENT_TYPE)
      .is('cancelled_at', null)
      // A tournament that began before this window can still run this week.
      .or(`start_time.gte.${wide.from},end_time.gte.${wide.from}`)
      .lt('start_time', wide.to)
      .order('start_time', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  // The player's own replies in the same window, read beside the events: a player reads their own rows before and after
  // migration 20261017102000. `player_id` is checked again below, so a teammate's row can never count as theirs.
  const playerId = input.viewer === 'player' ? (input.playerId ?? null) : null;
  const ownRead = playerId
    ? fetchAllRowsResult((from, to) =>
        supabase
          .from('golf_event_attendance')
          .select('id, event_id, player_id, status, golf_events!inner(id)')
          .eq('player_id', playerId)
          .eq('golf_events.team_id', input.teamId)
          .lt('golf_events.start_time', wide.to)
          .or(`start_time.gte.${wide.from},end_time.gte.${wide.from}`, { referencedTable: 'golf_events' })
          .order('id', { ascending: true })
          .range(from, to),
      )
    : null;
  const [tz, wideRes, ownRes] = await Promise.all([input.tz, eventsRead, ownRead]);
  /** The player's own reply by event; null when it didn't load (then no meeting is dropped here, and no reply is claimed). */
  let own: Map<string, ChRsvp> | null = null;
  if (ownRes?.error) log('ownReplies', ownRes.error);
  else if (ownRes) own = new Map((ownRes.data ?? []).filter((a) => a.player_id === playerId).map((a) => [a.event_id, rsvpOf(a.status)]));
  const today = ymd(now, tz);
  const { weekStart, weekEnd, from, to } = weekWindow(today);
  const eventsRes = wideRes.error ? wideRes : {
    ...wideRes,
    data: (wideRes.data ?? []).filter((e) => {
      const start = Date.parse(e.start_time);
      const end = Date.parse(e.end_time ?? e.start_time);
      return start < to && Math.max(start, Number.isFinite(end) ? end : start) >= from;
    }),
  };

  // When the player's own replies didn't load, D2-8 decides which meetings they see (a meeting nobody is invited to is
  // the coach's own), from the counts or the invite rows; when that fails too, none (playerSeesMeeting fails closed).
  const fallbackMeetings = playerId && !own && !eventsRes.error ? (eventsRes.data ?? []).filter((e) => e.event_type === 'meeting').map((e) => e.id) : [];
  const invitedFallback = fallbackMeetings.length ? await loadInvitedCounts(supabase, fallbackMeetings, (err) => log('meetingInvites', err)) : null;

  // ── Week ──
  if (eventsRes.error) log('events', eventsRes.error);
  // The shared calendar contract preserves UTC-midnight all-day dates and
  // treats their end day as inclusive. Cache each span once for the week.
  const calendarDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const events = (eventsRes.error ? [] : (eventsRes.data ?? [])).flatMap((e) => {
    const span = eventDaySpan(e, tz);
    // Decision B (owner, wave 7): a meeting the player isn't invited to is not on their week: not a day's count, not the
    // agenda, not Up next (which moves on to the next event they can see).
    if (playerId && e.event_type === 'meeting' && !playerSeesMeeting(own ? own.has(e.id) : null, invitedFallback?.get(e.id) ?? null)) return [];
    return span ? [{ ...e, localDate: calendarDate(span.first), lastDate: calendarDate(span.last) }] : [];
  });
  const runsOn = (e: (typeof events)[number], date: string) => e.localDate <= date && e.lastDate >= date;
  const notOver = (e: (typeof events)[number]) => e.all_day ? e.lastDate >= today : new Date(e.end_time ?? e.start_time) > now;
  const days: ChHomeDay[] = WEEKDAYS.map((weekday, i) => {
    const date = addDays(weekStart, i);
    const dayEvents = events.filter((e) => runsOn(e, date));
    return {
      date,
      weekday,
      dayOfMonth: Number(date.slice(8, 10)),
      isToday: date === today,
      eventCount: dayEvents.length,
      hasCompetition: dayEvents.some((e) => COMPETITION_TYPES.has(e.event_type)),
      competitionType: dayEvents.some((e) => e.event_type === 'tournament')
        ? 'tournament'
        : dayEvents.some((e) => e.event_type === 'qualifier')
          ? 'qualifier'
          : null,
    };
  });

  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  const clock = (iso: string) => timeFmt.format(new Date(iso)).replace(/\s?[AP]M$/, '');
  const hmFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
  const clockHm = (iso: string) => hmFmt.format(new Date(iso));
  const todays = events.filter((e) => runsOn(e, today));
  const later = events.filter((e) => e.localDate > today && e.localDate <= weekEnd && COMPETITION_TYPES.has(e.event_type));
  const nextId = todays.find(notOver)?.id;
  // The phone's Up next: the first event not over yet, today or after (the window runs a day past the week).
  const upcoming = events.find((e) => e.lastDate >= today && notOver(e)) ?? null;

  // Who is invited, and who has said yes, for the rows shown. A failed read
  // drops the counts and names, never shows "0 players".
  const invited = new Map<string, string[]>();
  const accepted = new Map<string, number>();
  const unanswered = new Map<string, string[]>();
  /** Rows the coach's invitation wrote (`notified_at`): none means the event is open to the whole team. */
  const coachInvited = new Map<string, number>();
  let attendanceError = false;
  const weekIds = [...new Set([...todays, ...later, ...(upcoming ? [upcoming] : [])].map((e) => e.id))];
  // A player's Home: counts only (migration 20261017102000). `missing` (not applied yet) falls through to the rows.
  const counts = input.viewer === 'player' ? await loadAttendanceCounts(supabase, weekIds) : null;
  const countsByEvent: Map<string, ChAttendanceCounts> | null = counts?.kind === 'ok' ? counts.byEvent : null;
  if (counts?.kind === 'error') {
    // CH-2209: without replies, agenda rows drop who is invited and the confirmed count, never "0 players".
    log('attendance', counts.error);
    attendanceError = true;
  } else if (!countsByEvent) {
    // The chunks are independent, so they are read together.
    const attendance = await Promise.all(
      chunkIds(weekIds).map((ids) =>
        fetchAllRowsResult((from, to) =>
          supabase.from('golf_event_attendance').select('id, event_id, player_id, status, notified_at').in('event_id', ids).order('id', { ascending: true }).range(from, to),
        ),
      ),
    );
    for (const { data, error } of attendance) {
      if (error) {
        // CH-2209: without replies, agenda rows drop who is invited and the confirmed count, never "0 players".
        log('attendance', error);
        attendanceError = true;
        break;
      }
      for (const a of data ?? []) {
        invited.set(a.event_id, [...(invited.get(a.event_id) ?? []), a.player_id]);
        if (rsvpOf(a.status) === 'accepted') accepted.set(a.event_id, (accepted.get(a.event_id) ?? 0) + 1);
        if (rsvpOf(a.status) === 'pending') unanswered.set(a.event_id, [...(unanswered.get(a.event_id) ?? []), a.player_id]);
        if (a.notified_at) coachInvited.set(a.event_id, (coachInvited.get(a.event_id) ?? 0) + 1);
      }
    }
  }
  if (countsByEvent) for (const [id, c] of countsByEvent) accepted.set(id, c.accepted);
  // Invitee ids (the rows' path) or, from the counts, only how many: no identities.
  const inviteesOf = (id: string): string[] | null => (attendanceError || countsByEvent ? null : (invited.get(id) ?? []));
  const invitedOf = (id: string): string[] | number | null =>
    attendanceError ? null : countsByEvent ? (countsByEvent.get(id)?.invited ?? 0) : (invited.get(id) ?? []);
  const names = await input.names;

  const agenda: ChAgendaRow[] = [
    ...todays.map((e) => ({
      id: e.id,
      timeLabel: e.all_day ? 'All day' : clock(e.start_time),
      ...(e.all_day ? {} : { hm: clockHm(e.start_time) }),
      title: e.title,
      detail: inviteDetail({ location: e.location, title: e.title, invitees: invitedOf(e.id), names }),
      isNext: e.id === nextId,
      isCompetition: COMPETITION_TYPES.has(e.event_type),
      when: 'today' as const,
    })),
    ...later.map((e) => ({
      id: e.id,
      timeLabel: WEEKDAYS[weekdayIndexMonFirst(e.localDate)] ?? '',
      ...(e.all_day ? {} : { hm: clockHm(e.start_time) }),
      title: e.title,
      detail:
        // "5 of 6 going" only for an event that asks for replies (owner, 2026-10-08); otherwise where it is.
        [e.all_day ? null : `First tee ${clock(e.start_time)}`, (e.requires_rsvp === true ? confirmedLine(invitedOf(e.id), accepted.get(e.id) ?? 0) : null) ?? e.location].filter(Boolean).join(' · ') ||
        null,
      isNext: false,
      isCompetition: true,
      when: 'later' as const,
    })),
  ];
  const nextComp = [...todays, ...later].find((e) => COMPETITION_TYPES.has(e.event_type) && notOver(e));
  // These are calendar dates already in the team's zone; don't zone them twice.
  const longDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' });
  const weekdayOf = (date: string) => longDay.format(new Date(`${date}T12:00:00Z`));

  // ── Phone: Up next and Today ──
  const clockAmPm = (iso: string) => timeFmt.format(new Date(iso));
  const timed = todays.filter((e) => !e.all_day && e.end_time);
  const overlaps = (e: (typeof events)[number]) =>
    !e.all_day && !!e.end_time && timed.some((o) => o.id !== e.id && new Date(o.start_time) < new Date(e.end_time!) && new Date(e.start_time) < new Date(o.end_time!));
  const phoneBase = (e: (typeof events)[number]) => ({
    id: e.id,
    title: e.title,
    type: HOME_TYPES.has(e.event_type) ? (e.event_type as ChHomeEvent['type']) : ('other' as const),
    date: e.localDate,
    timezone: tz,
    startIso: e.start_time,
    endIso: e.end_time,
    allDay: !!e.all_day,
    startLabel: e.all_day ? 'All day' : clockAmPm(e.start_time),
    rangeLabel: e.all_day ? 'All day' : e.end_time ? `${clock(e.start_time)} – ${clockAmPm(e.end_time)}` : clockAmPm(e.start_time),
    location: e.location,
  });
  /**
   * The player's own reply (`mine`), by the rule the sidebar's card uses too (playerMine): only on an event that asks for
   * one, while the server would take it (`replyClosedAt`), and, with no row of theirs, when the coach invited no one so
   * the whole team may reply. Unknown (a failed read) claims nothing.
   */
  const mineOf = (e: (typeof events)[number]): ChHomeEvent['mine'] => {
    if (!own || e.requires_rsvp !== true) return null;
    const open = attendanceError ? null : countsByEvent ? (countsByEvent.get(e.id)?.coachInvited ?? 0) === 0 : (coachInvited.get(e.id) ?? 0) === 0;
    return playerMine(own.get(e.id), replyClosedAt(e, now.getTime()), open);
  };
  const toPhone = (e: (typeof events)[number]): ChHomeEvent => {
    const ids = inviteesOf(e.id);
    const invitees = ids ? ids.map((id) => names.get(id)).filter((n): n is string => !!n) : null;
    // Replies count, and the unanswered get a nudge, only on an event that asks for them (owner, 2026-10-08). Without
    // it the card says who is invited, and its action is Message, not Nudge. Null (older rows) reads as off.
    const asks = e.requires_rsvp === true;
    const invitedCount = attendanceError ? null : countsByEvent ? (countsByEvent.get(e.id)?.invited ?? 0) : (ids?.length ?? 0);
    if (countsByEvent) {
      // Counts only (a player's Home): no names and no ids, exactly as the rows' path renders for a player, who is
      // passed no names. The paired "N of M going" needs every invitee's name, so it stands only when nobody is invited.
      return {
        ...phoneBase(e),
        invitees: [],
        going: asks && invitedCount === 0 ? 0 : null,
        awaiting: asks ? [] : null,
        inviteeIds: null,
        invitedCount,
        ...(playerId ? { mine: mineOf(e) } : {}),
        conflict: runsOn(e, today) && overlaps(e),
      };
    }
    return {
      ...phoneBase(e),
      invitees,
      // The card pairs this number with the rendered names' count. Partial
      // identities cannot turn "3 of 4" actual replies into "3 of 2 going".
      going: asks && ids && invitees?.length === ids.length ? (accepted.get(e.id) ?? 0) : null,
      awaiting: asks && ids ? (unanswered.get(e.id) ?? []).flatMap((id) => (names.has(id) ? [{ id, name: names.get(id)! }] : [])) : null,
      inviteeIds: ids,
      invitedCount,
      // The coach's: whether the event still takes a reply (the server's rule), for the desktop Next row's Nudge.
      ...(input.viewer !== 'player' ? { replyOpen: asks && !replyClosedAt(e, now.getTime()) } : {}),
      ...(playerId ? { mine: mineOf(e) } : {}),
      conflict: runsOn(e, today) && overlaps(e),
    };
  };
  const firstLater = later.find((e) => e.localDate > today);

  return {
    today,
    weekStart,
    weekEnd,
    week: { days, agenda, error: !!eventsRes.error },
    nextCompetition: nextComp ? { title: nextComp.title, when: runsOn(nextComp, today) ? 'today' : weekdayOf(nextComp.localDate) } : null,
    next: eventsRes.error || !upcoming ? null : toPhone(upcoming),
    todayEvents: eventsRes.error ? [] : todays.map(toPhone),
    weekNote: firstLater ? { weekday: weekdayOf(firstLater.localDate), title: firstLater.title } : null,
  };

}

const HOME_TYPES = new Set(['practice', 'qualifier', 'tournament', 'meeting', 'travel', 'other']);

/**
 * The windows the team's form and its four parts read (Stats' Last 10, Team): each player's newest ten 18-hole rounds
 * (`last`), each player's ten before them (`prev`), and, for a change (Q-112: the same players), the newest ten of the
 * players who also have a previous ten (`lastPaired`).
 */
export function teamWindows(full: ChRound[]): { last: ChRound[]; prev: ChRound[]; lastPaired: ChRound[] } {
  const f = filterFor('last10');
  const last: ChRound[] = [];
  const prev: ChRound[] = [];
  const lastPaired: ChRound[] = [];
  for (const list of groupByPlayer(full).values()) {
    const cur = roundsInFilter(list, f);
    const before = previousInFilter(list, f) ?? [];
    last.push(...cur);
    if (before.length) {
      prev.push(...before);
      lastPaired.push(...cur);
    }
  }
  return { last, prev, lastPaired };
}

/**
 * The team's form on the Stats page's own basis, so Home and Stats (Last 10, Team) read the same: each
 * player's newest ten 18-hole rounds (in any season, Q-122), pooled, against each player's ten before them
 * (`roundsInFilter` / `previousInFilter`, as `loadTeamStats` reads them). Scoring is a per-round mean over every
 * round, a total-only one included; putts are a per-round mean and greens pool the holes (never a mean of percentages),
 * both over the rounds with their holes (Q-123). The line is the team's average on each of its last ten round days
 * (as Stats' scoring trend draws it), oldest to newest: one point a day, not one a round. `basis` says how many rounds and which dates the figures rest on, so a strip built on three August
 * rounds says so. Exported for the tests.
 */
export function teamForm(full: ChRound[], roundsThisWeek: number): ChTeamForm | null {
  const { last, prev, lastPaired } = teamWindows(full);
  if (!last.length) return null;
  // Greens and putts are hole-level: a round posted as a total only has none (Q-123), whatever its row holds.
  const hasGir = (r: ChRound) => hasHoleScores(r) && r.total_gir != null && !!r.total_gir_possible;
  const girOf = (list: ChRound[]) => {
    const withGir = list.filter(hasGir);
    const possible = withGir.reduce((a, r) => a + (r.total_gir_possible as number), 0);
    return possible ? (withGir.reduce((a, r) => a + (r.total_gir as number), 0) / possible) * 100 : null;
  };
  const scoreOf = (r: ChRound) => r.total_score;
  // Putts as Stats counts them: per 18, and a round written 0 putts has none recorded (recordedPutts, cachedPutts).
  const puttsOf = (r: ChRound) => (hasHoleScores(r) ? recordedPutts(r.total_putts) : null);
  // A round's own green rate, for the standard error of the greens' change.
  const girRates = (list: ChRound[]) => list.filter(hasGir).map((r) => ((r.total_gir as number) / (r.total_gir_possible as number)) * 100);
  const comparable = prev.length > 0;
  const avg = weightedMean(last, scoreOf) as number;
  const prevAvg = comparable ? weightedMean(prev, scoreOf) : null;
  const pairedAvg = comparable ? weightedMean(lastPaired, scoreOf) : null;
  // Greens hold to Stats' floor (A7): under two rounds with greens there is no share, only what it needs.
  const girFloor = floorRate('fraction', last.filter(hasGir).length, girOf(last));
  const gir = girFloor.value;
  const prevGir = comparable ? girOf(prev) : null;
  const pairedGir = comparable ? girOf(lastPaired) : null;
  const putts = weightedMean(last, puttsOf);
  const prevPutts = comparable ? weightedMean(prev, puttsOf) : null;
  const pairedPutts = comparable ? weightedMean(lastPaired, puttsOf) : null;
  const byDate = (a: ChRound, b: ChRound) => (a.round_date < b.round_date ? -1 : a.round_date > b.round_date ? 1 : a.id.localeCompare(b.id));
  const byDay = new Map<string, number[]>();
  for (const r of [...last].sort(byDate)) {
    const d = r.round_date.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), r.total_score as number]);
  }
  const line = [...byDay.values()].slice(-10).map((scores) => mean(scores) as number);
  const dates = last.map((r) => r.round_date.slice(0, 10)).sort();
  return {
    avg,
    delta: prevAvg != null && pairedAvg != null ? pairedAvg - prevAvg : null,
    deltaSe: comparable ? windowChangeSe(lastPaired, prev, scoreOf, 'score') : null,
    line,
    roundsThisWeek,
    basis: { rounds: last.length, from: dates[0]!, to: dates[dates.length - 1]!, girRounds: last.filter(hasGir).length, puttsRounds: last.filter((r) => puttsOf(r) != null).length },
    gir: { pct: gir, ...(girFloor.needs ? { needs: girFloor.needs } : {}), delta: gir != null && pairedGir != null && prevGir != null ? pairedGir - prevGir : null, se: comparable ? changeSe(girRates(lastPaired), girRates(prev), null) : null },
    putts: { avg: putts, delta: pairedPutts != null && prevPutts != null ? pairedPutts - prevPutts : null, se: comparable ? windowChangeSe(lastPaired, prev, puttsOf, null) : null },
  };
}

const LEG_KEYS: readonly ChTeamLegKey[] = ['tee', 'approach', 'around', 'putting'];
/** Each part's plain stat: Player Home's leg (legRows) and its Tour metric. */
const LEG_STATS: Record<ChTeamLegKey, { leg: 'tee' | 'approach' | 'short' | 'putting'; label: ChTeamLeg['stat']['label'] }> = {
  tee: { leg: 'tee', label: 'Fairways' },
  approach: { leg: 'approach', label: 'Greens' },
  around: { leg: 'short', label: 'Up and down' },
  putting: { leg: 'putting', label: 'Putts' },
};

/**
 * Who gains and who loses most in a part, from Team Stats' ranking (`teamRankRows` over `teamGrid`, the same players and
 * rules as its ranked plot): the first ranked place gains most, the last ranked place loses most. Players sharing a place
 * (a tie, "T2") are named together. One ranked player, or everyone ranked in one place, loses nothing.
 */
export function legPeople(rows: TeamRankRow[]): { gains: ChLegPeople | null; loses: ChLegPeople | null } {
  const ranked = rows.filter((r): r is TeamRankRow & { rank: number; value: number } => r.rank != null && r.value != null);
  const head = ranked[0];
  if (!head) return { gains: null, loses: null };
  const at = (rank: number) => ranked.filter((r) => r.rank === rank);
  const people = (list: typeof ranked): ChLegPeople => ({ ids: list.map((r) => r.id), names: list.map((r) => r.short), value: list[0]!.value });
  const tail = ranked[ranked.length - 1]!;
  return { gains: people(at(head.rank)), loses: ranked.length < 2 || tail.rank === head.rank ? null : people(at(tail.rank).reverse()) };
}

/**
 * The team's four parts (spec B §1), on the form's own Last 10 rounds (`teamWindows`), hole-level throughout (Q-123):
 * strokes gained per round in each part (MIN_SG_ROUNDS whole rounds with it, else null), its change against each
 * player's previous ten (the same players, Q-112, with the standard error Team Stats uses for strokes gained), the
 * part's plain stat pooled over the same rounds with the Tour's mark (Player Home's legRows), and who gains and loses
 * most (Team Stats' ranking). `players` is the active roster: no one else's round reaches the grid. Null with no round.
 * Exported for the tests.
 */
export function teamLegs(input: {
  full: ChRound[];
  players: Array<{ id: string; first_name: string | null; last_name: string | null }>;
  cache: { byRound: Map<string, ChRoundCache>; error: boolean };
  /** Null when the tour is unknown (no marks, no notice). */
  bench: { bench: Map<string, number>; error: boolean } | null;
  tour: ChSgTour;
}): ChTeamLegs | null {
  const roster = new Set(input.players.map((p) => p.id));
  const full = input.full.filter((r) => roster.has(r.player_id));
  const { last, prev, lastPaired } = teamWindows(full);
  if (!last.length) return null;
  const holeLast = holeRounds(last);
  const holePrev = holeRounds(prev);
  const holePaired = holeRounds(lastPaired);
  const grid = teamGrid(input.players, full, filterFor('last10'));
  const marks = input.bench && !input.bench.error ? input.bench.bench : null;
  const stats = legRows(holeLast, input.cache.byRound, marks, { tee: null, approach: null, around: null, putting: null });
  let ranked = false;
  const rows = LEG_KEYS.map((key, i): ChTeamLeg => {
    const pick = (r: ChRound) => sgLegs(r)[i] ?? null;
    const sg = effectiveCount(holeLast, pick) >= MIN_SG_ROUNDS ? weightedMean(holeLast, pick) : null;
    const prevSg = effectiveCount(holePrev, pick) >= MIN_SG_ROUNDS ? weightedMean(holePrev, pick) : null;
    const pairedSg = weightedMean(holePaired, pick);
    const delta = sg != null && prevSg != null && pairedSg != null ? pairedSg - prevSg : null;
    const stat = stats.find((l) => l.key === LEG_STATS[key].leg)!;
    const who = legPeople(teamRankRows(grid, key as TeamRankMetric));
    if (who.gains) ranked = true;
    return {
      key,
      label: LEGS[i]!,
      stat: { label: LEG_STATS[key].label, value: stat.value, unit: stat.unit, digits: stat.digits, tour: marks ? stat.bench : null, ...(stat.needs ? { needs: stat.needs } : {}), ...(stat.early ? { early: stat.early } : {}) },
      sg,
      delta,
      se: delta != null ? windowChangeSe(holePaired, holePrev, pick, 'sg') : null,
      ...who,
    };
  });
  return { rows, holeRounds: holeLast.length, ranked, tour: input.tour, cacheError: input.cache.error, tourError: !!input.bench?.error };
}
