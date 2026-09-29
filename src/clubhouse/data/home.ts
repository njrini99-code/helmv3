import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { isCountableRound } from '@/lib/golf/round-countable';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';
import { getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { getGreeting, timeOfDayForHour } from '@/lib/utils/time-of-day';
import { chLogServer } from '../lib/track-server';

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
  status: 'improving' | 'steady' | 'slipping' | 'early';
}

export interface ChCoachHome {
  greeting: string;
  todayLabel: string;
  week: { days: ChHomeDay[]; agenda: ChAgendaRow[]; error: boolean };
  /** holesError: the rounds loaded but their hole-by-hole detail didn't. */
  latestRounds: { rounds: ChLatestRound[]; error: boolean; holesError: boolean };
  leaderboard: { rows: ChLeaderRow[]; scorecards: number; rosterSize: number; error: boolean };
}

const COMPETITION_TYPES = new Set(['tournament', 'qualifier']);
const TREND_LENGTH = 7;
const MIN_SG_ROUNDS = 3;

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

/** "Senior", "Junior"... from a graduation year and the academic year in progress. */
export function classYearLabel(graduationYear: number | null, now = new Date()): string | null {
  if (!graduationYear) return null;
  const academicEnd = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
  const labels = ['Senior', 'Junior', 'Sophomore', 'Freshman'];
  return labels[graduationYear - academicEnd] ?? `Class of ${graduationYear}`;
}

/** Recent form: the newer half of the trend against the older half, in strokes. */
export function formStatus(trend: number[]): ChLeaderRow['status'] {
  if (trend.length < 3) return 'early';
  const half = Math.floor(trend.length / 2);
  const older = trend.slice(0, half);
  const newer = trend.slice(trend.length - half);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const change = mean(newer) - mean(older);
  if (change <= -0.5) return 'improving';
  if (change >= 0.5) return 'slipping';
  return 'steady';
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export async function loadCoachHome(input: { teamId: string; coachName: string }): Promise<ChCoachHome> {
  const supabase = await createClient();
  const now = new Date();

  const { data: settings, error: settingsError } = await supabase
    .from('golf_team_settings')
    .select('timezone')
    .eq('team_id', input.teamId)
    .maybeSingle();
  if (settingsError) log('timezone', settingsError);
  const tz = settings?.timezone || 'America/New_York';

  let greeting = 'Welcome back';
  try {
    greeting = getGreeting(timeOfDayForHour(getCurrentDecimalHourInTz(tz)));
  } catch {
    /* unknown zone: the time-neutral phrase is never wrong */
  }
  const firstName = input.coachName.trim().split(/\s+/)[0] || 'Coach';
  const todayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  const today = ymd(now, tz);
  const weekStart = addDays(today, -weekdayIndexMonFirst(today));
  const weekEnd = addDays(weekStart, 6);
  // A day of slack either side covers every UTC offset; rows are bucketed by team-local date below.
  const windowStart = `${addDays(weekStart, -1)}T00:00:00Z`;
  const windowEnd = `${addDays(weekEnd, 2)}T00:00:00Z`;

  const seasonStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const seasonStart = `${seasonStartYear}-08-01`;

  const [eventsRes, rosterRes] = await Promise.all([
    supabase
      .from('golf_events')
      .select('id, title, event_type, start_time, end_time, all_day, location')
      .eq('team_id', input.teamId)
      .neq('event_type', CLASS_EVENT_TYPE)
      .is('cancelled_at', null)
      .gte('start_time', windowStart)
      .lt('start_time', windowEnd)
      .order('start_time', { ascending: true })
      .limit(500),
    supabase
      .from('golf_team_members')
      .select('player:golf_players(id, first_name, last_name, graduation_year)')
      .eq('team_id', input.teamId)
      .eq('status', 'active'),
  ]);

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
  const nextId = todays.find((e) => new Date(e.end_time ?? e.start_time) > now)?.id;
  const agenda: ChAgendaRow[] = [
    ...todays.map((e) => ({
      id: e.id,
      timeLabel: e.all_day ? 'All day' : clock(e.start_time),
      title: e.title,
      detail: e.location,
      isNext: e.id === nextId,
      isCompetition: COMPETITION_TYPES.has(e.event_type),
      when: 'today' as const,
    })),
    ...events
      .filter((e) => e.localDate > today && e.localDate <= weekEnd && COMPETITION_TYPES.has(e.event_type))
      .map((e) => ({
        id: e.id,
        timeLabel: WEEKDAYS[weekdayIndexMonFirst(e.localDate)] ?? '',
        title: e.title,
        detail: [e.all_day ? null : `Starts ${clock(e.start_time)}`, e.location].filter(Boolean).join(' · ') || null,
        isNext: false,
        isCompetition: true,
        when: 'later' as const,
      })),
  ];

  // ── Roster ──
  if (rosterRes.error) log('roster', rosterRes.error);
  type RosterPlayer = { id: string; first_name: string | null; last_name: string | null; graduation_year: number | null };
  const roster = ((rosterRes.data ?? []) as Array<{ player: RosterPlayer | null }>)
    .map((m) => m.player)
    .filter((p): p is RosterPlayer => p !== null);
  const nameOf = (p: RosterPlayer) => [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed player';
  const playerById = new Map(roster.map((p) => [p.id, p]));

  // ── Season rounds ──
  type RoundRow = {
    id: string;
    player_id: string;
    course_name: string | null;
    tees_played: string | null;
    round_date: string;
    total_score: number | null;
    score_to_par: number | null;
    front_nine: number | null;
    back_nine: number | null;
    holes_played: number | null;
    total_putts: number | null;
    total_gir: number | null;
    total_gir_possible: number | null;
    strokes_gained_total: number | null;
  };
  let rounds: RoundRow[] = [];
  let roundsError = !!rosterRes.error;
  if (!rosterRes.error && roster.length > 0) {
    for (const ids of chunkIds(roster.map((p) => p.id))) {
      const res = await fetchAllRowsResult<RoundRow>(
        (from, to) =>
          supabase
            .from('golf_rounds')
            .select(
              'id, player_id, course_name, tees_played, round_date, total_score, score_to_par, front_nine, back_nine, holes_played, total_putts, total_gir, total_gir_possible, strokes_gained_total',
            )
            .in('player_id', ids)
            .eq('is_test', false)
            .eq('status', 'completed')
            .not('total_score', 'is', null)
            .gte('round_date', seasonStart)
            .order('round_date', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        undefined,
        { table: 'golf_rounds', action: 'loadCoachHome', feature: 'coach_dashboard', sport: 'golf' },
      );
      if (res.error) {
        log('rounds', res.error);
        roundsError = true;
        break;
      }
      rounds.push(...(res.data ?? []));
    }
    rounds = rounds
      .filter((r) => isCountableRound(r))
      .sort((a, b) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : a.id.localeCompare(b.id)));
  }
  const full = rounds.filter((r) => (r.holes_played ?? 18) === 18 && r.total_score != null);

  // ── Latest rounds with hole-by-hole ──
  const latest = full.slice(0, 3);
  const holesByRound = new Map<string, ChHoleScore[]>();
  let holesError = false;
  if (latest.length) {
    for (const ids of chunkIds(latest.map((r) => r.id))) {
      const { data, error } = await supabase
        .from('golf_holes')
        .select('round_id, hole_number, par, score')
        .in('round_id', ids)
        .order('hole_number', { ascending: true });
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
  }
  const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const latestRounds: ChLatestRound[] = latest.map((r) => {
    const holes = holesByRound.get(r.id);
    const p = playerById.get(r.player_id);
    return {
      id: r.id,
      playerId: r.player_id,
      playerName: p ? nameOf(p) : 'Former player',
      meta: [r.course_name, dateFmt.format(new Date(`${r.round_date.slice(0, 10)}T12:00:00Z`)), r.tees_played ? `${r.tees_played} tees` : null]
        .filter(Boolean)
        .join(' · '),
      score: r.total_score ?? 0,
      toPar: r.score_to_par,
      holes: holes && holes.length === 18 ? holes : null,
      gir: r.total_gir != null && r.total_gir_possible ? `${r.total_gir}/${r.total_gir_possible}` : null,
      putts: r.total_putts,
      sg: r.strokes_gained_total,
    };
  });

  // ── Leaderboard ──
  const byPlayer = new Map<string, RoundRow[]>();
  for (const r of full) {
    const list = byPlayer.get(r.player_id) ?? [];
    list.push(r);
    byPlayer.set(r.player_id, list);
  }
  const rows: ChLeaderRow[] = [];
  for (const p of roster) {
    const list = byPlayer.get(p.id);
    if (!list?.length) continue;
    const scores = list.map((r) => r.total_score as number);
    const sgs = list.map((r) => r.strokes_gained_total).filter((v): v is number => v != null);
    const toPars = list.map((r) => r.score_to_par).filter((v): v is number => v != null);
    const trend = scores.slice(0, TREND_LENGTH).reverse();
    rows.push({
      playerId: p.id,
      name: nameOf(p),
      classYear: classYearLabel(p.graduation_year, now),
      rounds: list.length,
      avg: mean(scores) ?? 0,
      toPar: mean(toPars),
      trend,
      sgPerRound: sgs.length >= MIN_SG_ROUNDS ? mean(sgs) : null,
      status: formStatus(trend),
    });
  }
  rows.sort((a, b) => a.avg - b.avg || b.rounds - a.rounds);

  return {
    greeting: `${greeting}, ${firstName}.`,
    todayLabel,
    week: { days, agenda, error: !!eventsRes.error },
    latestRounds: { rounds: latestRounds, error: roundsError, holesError },
    leaderboard: { rows, scorecards: full.length, rosterSize: roster.length, error: roundsError },
  };
}
