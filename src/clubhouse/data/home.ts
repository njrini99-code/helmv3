import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { getGreeting, timeOfDayForHour } from '@/lib/utils/time-of-day';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, fullName, groupByPlayer, isFull18, lastTenFloor, loadSeasonRounds, mean, summarizePlayer, type ChForm, type ChRound } from './season';
import { hasHoleScores } from './round-scope';
import { previousInFilter, roundsInFilter, seasonOnly } from './stats-common';
import { filterFor } from './stats-filter';
import { weightedMean } from './stats-weight';
import { rsvpOf } from './calendar';
import { confirmedLine, daysBetween, homeSubline, inviteDetail } from '../screens/home/model';

export { classYearLabel, formStatus } from './season';

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
}

export interface ChAgendaRow {
  id: string;
  /** "3:30" or "All day", or a weekday ("Thu") for rows after today. */
  timeLabel: string;
  title: string;
  detail: string | null;
  isNext: boolean;
  isCompetition: boolean;
  /** Today's rows, then competitions later this week. */
  when: 'today' | 'later';
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
}

/** One team event as the phone Home draws it (Up next and Today). */
export interface ChHomeEvent {
  id: string;
  title: string;
  type: 'practice' | 'qualifier' | 'tournament' | 'meeting' | 'travel' | 'other';
  /** Team-local date, YYYY-MM-DD. */
  date: string;
  startIso: string;
  endIso: string | null;
  allDay: boolean;
  /** "3:30 PM" */
  startLabel: string;
  /** "3:30 – 5:30 PM", or "All day" */
  rangeLabel: string;
  location: string | null;
  /** Invitees' names, in roster order; null when replies didn't load (CH-2209). */
  invitees: string[] | null;
  /** Accepted replies; null when replies didn't load. */
  going: number | null;
  /** Overlaps another of today's timed events. */
  conflict: boolean;
}

/**
 * The team's scoring form (phone Home), on the Stats page's Last 10 basis: each player's newest ten 18-hole
 * rounds this season against each player's ten before (`teamForm`).
 */
export interface ChTeamForm {
  avg: number;
  /** Against each player's previous ten; null when no player has three rounds before their newest ten. */
  delta: number | null;
  /** The team's average on each of its last ten round days (the rounds the average rests on), oldest to newest, for the line. */
  line: number[];
  /** Countable rounds of either length in the team-local Monday-to-Sunday week: a count on its own basis, not the figures'. */
  roundsThisWeek: number;
  /** What the average, greens and putts rest on: the rounds, their first and last dates, and how many carry greens and putts. */
  basis: { rounds: number; from: string; to: string; girRounds: number; puttsRounds: number };
  /** Greens in regulation, percent; delta in points. */
  gir: { pct: number | null; delta: number | null };
  putts: { avg: number | null; delta: number | null };
}

export interface ChCoachHome {
  greeting: string;
  /** The team chat to open from "Message team"; null opens Messages. */
  teamChatId: string | null;
  /** Who needs a look and what's next, from the leaderboard and the week. Null when that read failed. */
  subline: string | null;
  todayLabel: string;
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
}

const COMPETITION_TYPES = new Set(['tournament', 'qualifier']);

function log(read: string, error: unknown) {
  chLogServer('home', read, error);
}

/** YYYY-MM-DD for an instant in a timezone. */
function ymd(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function loadCoachHome(input: { teamId: string; coachName: string }): Promise<ChCoachHome> {
  const supabase = await createClient();
  const now = new Date();

  const { tz, greeting, todayLabel } = await homeClock(supabase, input.teamId, now);
  const firstName = input.coachName.trim().split(/\s+/)[0] || 'Coach';

  // The roster, the team chat and the week load together; the week waits for the roster's names only to label invitees.
  type RosterPlayer = { id: string; first_name: string | null; last_name: string | null; graduation_year: number | null };
  const rosterRead = Promise.resolve(
    supabase.from('golf_team_members').select('player:golf_players(id, first_name, last_name, graduation_year)').eq('team_id', input.teamId).eq('status', 'active'),
  );
  const rosterOf = (res: Awaited<typeof rosterRead>) =>
    ((res.data ?? []) as Array<{ player: RosterPlayer | null }>).map((m) => m.player).filter((p): p is RosterPlayer => p !== null);
  const nameOf = fullName;
  const [rosterRes, chatRes, wk] = await Promise.all([
    rosterRead,
    supabase.from('golf_conversations').select('id').eq('team_id', input.teamId).eq('is_team_chat', true).order('created_at', { ascending: true }).limit(1),
    loadHomeWeek(supabase, { teamId: input.teamId, tz, now, names: rosterRead.then((res) => new Map(rosterOf(res).map((p) => [p.id, nameOf(p)]))) }),
  ]);
  // CH-2208: without the team chat, Message team opens Messages instead.
  if (chatRes.error) log('team chat', chatRes.error);

  // ── Roster ──
  if (rosterRes.error) log('roster', rosterRes.error);
  const roster = rosterOf(rosterRes);
  const playerById = new Map(roster.map((p) => [p.id, p]));
  const { today, weekStart, weekEnd } = wk;

  // ── Season rounds ──
  let roundsError = !!rosterRes.error;
  let rounds: Awaited<ReturnType<typeof loadSeasonRounds>>['rounds'] = [];
  if (!rosterRes.error && roster.length > 0) {
    // The team's form is Stats' Last 10, which reaches back across seasons (Q-122): read as far as it does; the rest of Home is this season.
    const res = await loadSeasonRounds(supabase, roster.map((p) => p.id), { surface: 'home', since: lastTenFloor() });
    rounds = res.rounds;
    roundsError = res.error;
  }
  const full = rounds.filter(isFull18);
  const seasonRounds = seasonOnly(rounds);
  const seasonFull = seasonOnly(full);

  // ── Latest rounds with hole-by-hole ──
  const { rounds: latestRounds, holesError } = await latestWithHoles(supabase, seasonFull, (id) => {
    const p = playerById.get(id);
    return p ? nameOf(p) : 'Former player';
  });

  // ── Leaderboard ──
  const byPlayer = groupByPlayer(seasonFull);
  // Recency counts any countable round, nine holes included.
  const lastPlayed = new Map<string, string>();
  for (const r of seasonRounds) if (!lastPlayed.has(r.player_id)) lastPlayed.set(r.player_id, r.round_date.slice(0, 10));
  const rows: ChLeaderRow[] = [];
  for (const p of roster) {
    const list = byPlayer.get(p.id);
    if (!list?.length) continue;
    const season = summarizePlayer(list);
    rows.push({
      playerId: p.id,
      name: nameOf(p),
      classYear: classYearLabel(p.graduation_year, now),
      rounds: season.rounds,
      avg: season.avg ?? 0,
      toPar: season.toPar,
      trend: season.trend,
      sgPerRound: season.sgPerRound,
      status: season.status,
      quietDays: lastPlayed.has(p.id) ? Math.max(0, daysBetween(lastPlayed.get(p.id)!, today)) : null,
    });
  }
  // C-24(d): an early read (fewer than three 18-hole rounds) never outranks a player with a sample; ties go to more rounds, then the name.
  const early = (r: ChLeaderRow) => (r.status === 'early' ? 1 : 0);
  rows.sort((a, b) => early(a) - early(b) || a.avg - b.avg || b.rounds - a.rounds || a.name.localeCompare(b.name));

  // ── Phone: the team's form ──
  const form = roundsError ? null : teamForm(full, rounds.filter((r) => r.round_date.slice(0, 10) >= weekStart && r.round_date.slice(0, 10) <= weekEnd).length);

  return {
    greeting: `${greeting}, ${firstName}.`,
    teamChatId: chatRes.error ? null : (chatRes.data?.[0]?.id ?? null),
    subline: homeSubline(rows, { roundsError, nextCompetition: wk.nextCompetition }),
    todayLabel,
    week: wk.week,
    latestRounds: { rounds: latestRounds, error: roundsError, holesError },
    leaderboard: { rows, scorecards: seasonFull.length, rosterSize: roster.length, error: roundsError },
    phone: { next: wk.next, today: wk.todayEvents, form, weekNote: wk.weekNote },
  };
}

/**
 * The team's timezone (CH-2210: Eastern, the product default, when it doesn't
 * load or isn't a real zone), the time-of-day greeting in it, and today's long
 * date.
 */
export async function homeClock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  now: Date,
): Promise<{ tz: string; greeting: string; todayLabel: string }> {
  const { data: settings, error: settingsError } = await supabase.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle();
  if (settingsError) log('timezone', settingsError);
  // A stored value that isn't a real IANA zone would throw in every Intl call below; read it as missing instead.
  const tz = getValidTimezone(settings?.timezone);
  if (settings?.timezone && tz !== settings.timezone) log('timezone', new Error(`"${settings.timezone}" is not a timezone`));
  let greeting = 'Welcome back';
  try {
    greeting = getGreeting(timeOfDayForHour(getCurrentDecimalHourInTz(tz)));
  } catch {
    /* unknown zone: the time-neutral phrase is never wrong */
  }
  const todayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return { tz, greeting, todayLabel };
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
      score: r.total_score ?? 0,
      toPar: r.score_to_par,
      holes: holes && holes.length === 18 ? holes : null,
      gir: r.total_gir != null && r.total_gir_possible ? `${r.total_gir}/${r.total_gir_possible}` : null,
      putts: r.total_putts,
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
 */
export async function loadHomeWeek(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { teamId: string; tz: string; now: Date; names: Map<string, string> | Promise<Map<string, string>> },
): Promise<ChHomeWeek> {
  const { tz, now } = input;
  const today = ymd(now, tz);
  const weekStart = addDays(today, -weekdayIndexMonFirst(today));
  const weekEnd = addDays(weekStart, 6);
  // A day of slack either side covers every UTC offset; rows are bucketed by team-local date below.
  const windowStart = `${addDays(weekStart, -1)}T00:00:00Z`;
  const windowEnd = `${addDays(weekEnd, 2)}T00:00:00Z`;

  const eventsRes = await supabase
      .from('golf_events')
      .select('id, title, event_type, start_time, end_time, all_day, location')
      .eq('team_id', input.teamId)
      .neq('event_type', CLASS_EVENT_TYPE)
      .is('cancelled_at', null)
      .gte('start_time', windowStart)
      .lt('start_time', windowEnd)
      .order('start_time', { ascending: true })
      .limit(500);

  // ── Week ──
  if (eventsRes.error) log('events', eventsRes.error);
  const events = (eventsRes.error ? [] : (eventsRes.data ?? [])).map((e) => ({ ...e, localDate: ymd(new Date(e.start_time), tz) }));
  const days: ChHomeDay[] = WEEKDAYS.map((weekday, i) => {
    const date = addDays(weekStart, i);
    const dayEvents = events.filter((e) => e.localDate === date);
    return {
      date,
      weekday,
      dayOfMonth: Number(date.slice(8, 10)),
      isToday: date === today,
      eventCount: dayEvents.length,
      hasCompetition: dayEvents.some((e) => COMPETITION_TYPES.has(e.event_type)),
    };
  });

  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  const clock = (iso: string) => timeFmt.format(new Date(iso)).replace(/\s?[AP]M$/, '');
  const todays = events.filter((e) => e.localDate === today);
  const later = events.filter((e) => e.localDate > today && e.localDate <= weekEnd && COMPETITION_TYPES.has(e.event_type));
  const nextId = todays.find((e) => new Date(e.end_time ?? e.start_time) > now)?.id;
  // The phone's Up next: the first event not over yet, today or after (the window runs a day past the week).
  const upcoming = events.find((e) => e.localDate >= today && new Date(e.end_time ?? e.start_time) > now) ?? null;

  // Who is invited, and who has said yes, for the rows shown. A failed read
  // drops the counts and names, never shows "0 players".
  const invited = new Map<string, string[]>();
  const accepted = new Map<string, number>();
  let attendanceError = false;
  for (const ids of chunkIds([...new Set([...todays, ...later, ...(upcoming ? [upcoming] : [])].map((e) => e.id))])) {
    const { data, error } = await fetchAllRowsResult((from, to) =>
      supabase.from('golf_event_attendance').select('id, event_id, player_id, status').in('event_id', ids).order('id', { ascending: true }).range(from, to),
    );
    if (error) {
      // CH-2209: without replies, agenda rows drop who is invited and the confirmed count, never "0 players".
      log('attendance', error);
      attendanceError = true;
      break;
    }
    for (const a of data ?? []) {
      invited.set(a.event_id, [...(invited.get(a.event_id) ?? []), a.player_id]);
      if (rsvpOf(a.status) === 'accepted') accepted.set(a.event_id, (accepted.get(a.event_id) ?? 0) + 1);
    }
  }
  const inviteesOf = (id: string) => (attendanceError ? null : (invited.get(id) ?? []));
  const names = await input.names;

  const agenda: ChAgendaRow[] = [
    ...todays.map((e) => ({
      id: e.id,
      timeLabel: e.all_day ? 'All day' : clock(e.start_time),
      title: e.title,
      detail: inviteDetail({ location: e.location, title: e.title, invitees: inviteesOf(e.id), names }),
      isNext: e.id === nextId,
      isCompetition: COMPETITION_TYPES.has(e.event_type),
      when: 'today' as const,
    })),
    ...later.map((e) => ({
      id: e.id,
      timeLabel: WEEKDAYS[weekdayIndexMonFirst(e.localDate)] ?? '',
      title: e.title,
      detail:
        [e.all_day ? null : `First tee ${clock(e.start_time)}`, confirmedLine(inviteesOf(e.id), accepted.get(e.id) ?? 0) ?? e.location].filter(Boolean).join(' · ') ||
        null,
      isNext: false,
      isCompetition: true,
      when: 'later' as const,
    })),
  ];
  const nextComp = [...todays, ...later].find((e) => COMPETITION_TYPES.has(e.event_type) && new Date(e.end_time ?? e.start_time) > now);
  const longDay = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' });

  // ── Phone: Up next and Today ──
  const clockAmPm = (iso: string) => timeFmt.format(new Date(iso));
  const timed = todays.filter((e) => !e.all_day && e.end_time);
  const overlaps = (e: (typeof events)[number]) =>
    !e.all_day && !!e.end_time && timed.some((o) => o.id !== e.id && new Date(o.start_time) < new Date(e.end_time!) && new Date(e.start_time) < new Date(o.end_time!));
  const toPhone = (e: (typeof events)[number]): ChHomeEvent => {
    const ids = inviteesOf(e.id);
    return {
      id: e.id,
      title: e.title,
      type: HOME_TYPES.has(e.event_type) ? (e.event_type as ChHomeEvent['type']) : 'other',
      date: e.localDate,
      startIso: e.start_time,
      endIso: e.end_time,
      allDay: !!e.all_day,
      startLabel: e.all_day ? 'All day' : clockAmPm(e.start_time),
      rangeLabel: e.all_day ? 'All day' : e.end_time ? `${clock(e.start_time)} – ${clockAmPm(e.end_time)}` : clockAmPm(e.start_time),
      location: e.location,
      invitees: ids ? ids.map((id) => names.get(id)).filter((n): n is string => !!n) : null,
      going: ids ? (accepted.get(e.id) ?? 0) : null,
      conflict: e.localDate === today && overlaps(e),
    };
  };
  const firstLater = later.find((e) => e.localDate > today);

  return {
    today,
    weekStart,
    weekEnd,
    week: { days, agenda, error: !!eventsRes.error },
    nextCompetition: nextComp ? { title: nextComp.title, when: nextComp.localDate === today ? 'today' : longDay.format(new Date(nextComp.start_time)) } : null,
    next: eventsRes.error || !upcoming ? null : toPhone(upcoming),
    todayEvents: eventsRes.error ? [] : todays.map(toPhone),
    weekNote: firstLater ? { weekday: longDay.format(new Date(firstLater.start_time)), title: firstLater.title } : null,
  };

}

const HOME_TYPES = new Set(['practice', 'qualifier', 'tournament', 'meeting', 'travel', 'other']);

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
  const f = filterFor('last10');
  const last: ChRound[] = [];
  const prev: ChRound[] = [];
  for (const list of groupByPlayer(full).values()) {
    last.push(...roundsInFilter(list, f));
    prev.push(...(previousInFilter(list, f) ?? []));
  }
  if (!last.length) return null;
  // Greens and putts are hole-level: a round posted as a total only has none (Q-123), whatever its row holds.
  const hasGir = (r: ChRound) => hasHoleScores(r) && r.total_gir != null && !!r.total_gir_possible;
  const girOf = (list: ChRound[]) => {
    const withGir = list.filter(hasGir);
    const possible = withGir.reduce((a, r) => a + (r.total_gir_possible as number), 0);
    return possible ? (withGir.reduce((a, r) => a + (r.total_gir as number), 0) / possible) * 100 : null;
  };
  const scoreOf = (r: ChRound) => r.total_score;
  const puttsOf = (r: ChRound) => (hasHoleScores(r) ? r.total_putts : null);
  const comparable = prev.length > 0;
  const avg = weightedMean(last, scoreOf) as number;
  const prevAvg = comparable ? weightedMean(prev, scoreOf) : null;
  const gir = girOf(last);
  const prevGir = comparable ? girOf(prev) : null;
  const putts = weightedMean(last, puttsOf);
  const prevPutts = comparable ? weightedMean(prev, puttsOf) : null;
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
    delta: prevAvg != null ? avg - prevAvg : null,
    line,
    roundsThisWeek,
    basis: { rounds: last.length, from: dates[0]!, to: dates[dates.length - 1]!, girRounds: last.filter(hasGir).length, puttsRounds: last.filter((r) => puttsOf(r) != null).length },
    gir: { pct: gir, delta: gir != null && prevGir != null ? gir - prevGir : null },
    putts: { avg: putts, delta: putts != null && prevPutts != null ? putts - prevPutts : null },
  };
}
