/**
 * The demo team's season calendar. Pure date arithmetic on ISO dates
 * (YYYY-MM-DD), anchored to the academic year, never to "today": the same
 * season always has the same days, so a daily run only adds what has newly
 * happened and never shifts a past row (DD-04). Every competition day falls on
 * a weekday, and every weekday name the generator prints is computed from the
 * date it describes (DD-18).
 */
import { offsetMinutesFor } from '@/lib/golf/timezone';

const DAY_MS = 86_400_000;

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** 0 is Sunday, 1 Monday … 6 Saturday. */
export function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[weekday(iso)]!;
}

/** "Thursday 13 Nov", for copy. */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${weekdayName(iso)} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** The first day on or after `iso` whose weekday is `dow`. */
export function onOrAfter(iso: string, dow: number): string {
  return addDays(iso, (dow - weekday(iso) + 7) % 7);
}

/** The Monday of the week that holds `iso`. */
export function mondayOf(iso: string): string {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

/** A wall-clock time on a date in a time zone, as an ISO instant. Falls back to UTC for an unknown zone. */
export function instantAt(dateIso: string, hhmm: string, timeZone: string): string {
  const offset = offsetMinutesFor(dateIso, `${hhmm}:00`, timeZone) ?? 0;
  return new Date(Date.parse(`${dateIso}T${hhmm}:00Z`) + offset * 60_000).toISOString();
}

export interface AcademicYear {
  /** The calendar year the season starts in. */
  startYear: number;
  /** 1 Aug of `startYear`: day 0 for every story offset. */
  anchor: string;
  /** "2026-27", the golf_team_seasons format. */
  label: string;
}

/** The academic year a date belongs to: 1 Aug through 31 Jul. */
export function academicYearFor(todayIso: string): AcademicYear {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7));
  const startYear = m >= 8 ? y : y - 1;
  return {
    startYear,
    anchor: `${startYear}-08-01`,
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
  };
}

export type CompetitionKind = 'tournament' | 'qualifier';

export interface PlannedTournament {
  key: string;
  name: string;
  venueKey: string;
  /** Round dates, round 1 first. Two rounds can share a day (36-hole day). */
  days: string[];
  /** Local first-tee time per round. */
  teeTimes: string[];
  host: string;
  eventKind: 'regular' | 'conference';
  term: 'fall' | 'spring';
  /** The opener of the spring term: its lineup is set from the late-fall qualifier. */
  springOpener: boolean;
}

export interface PlannedQualifier {
  key: string;
  name: string;
  venueKey: string;
  days: string[];
  /** The tournament whose lineup this qualifier settles. */
  forTournamentKey: string;
  /** Spots decided here (top_score); the rest of the lineup is exempt. */
  spots: number;
}

export interface SeasonPlan {
  year: AcademicYear;
  tournaments: PlannedTournament[];
  qualifiers: PlannedQualifier[];
  /** Days with a practice round at the home course (team-wide, not every player plays each). */
  practiceRoundDays: string[];
  /** Days with a team practice session (an event), qualifier and tournament days excluded. */
  practiceDays: string[];
  /** Days with a team meeting. */
  meetingDays: string[];
  /** First and last day of each term's golf. */
  fall: { from: string; to: string };
  spring: { from: string; to: string };
}

/** Thanksgiving: the fourth Thursday of November. */
export function thanksgiving(year: number): string {
  return addDays(onOrAfter(`${year}-11-01`, 4), 21);
}

/** Days inside a term the team does not practise: spring break and Labor Day. The winter break is the gap between terms. */
function isBreak(iso: string, y: number): boolean {
  const md = iso.slice(5);
  if (Number(iso.slice(0, 4)) === y + 1 && md >= '03-14' && md <= '03-20') return true;
  return iso === onOrAfter(`${y}-09-01`, 1);
}

function mwf(monday: string): string[] {
  return [monday, addDays(monday, 2), addDays(monday, 4)];
}

function tournamentDays(monday: string, rounds: 3 | 4 = 3): string[] {
  // Day one is 36 holes, then 18 a day: the common college format.
  return rounds === 3
    ? [monday, monday, addDays(monday, 1)]
    : [monday, monday, addDays(monday, 1), addDays(monday, 2)];
}

const TEE_36 = ['08:00', '13:15', '08:30'];

/** The season for one academic year. Deterministic: the same year always gives the same plan. */
export function buildSeasonPlan(year: AcademicYear): SeasonPlan {
  const y = year.startYear;
  const n = y + 1;
  const mon = (md: string, yr = y) => onOrAfter(`${yr}-${md}`, 1);

  const t = (key: string, name: string, venueKey: string, monday: string, term: 'fall' | 'spring', extra: Partial<PlannedTournament> = {}): PlannedTournament => ({
    key,
    name,
    venueKey,
    days: tournamentDays(monday),
    teeTimes: TEE_36,
    host: `${name.split(' ')[0]} host committee`,
    eventKind: 'regular',
    term,
    springOpener: false,
    ...extra,
  });

  // Fall golf ends the week before Thanksgiving week and runs thirteen weeks
  // back from there; spring weeks count from the Monday on or after 2 Feb. The
  // spacing is the same every year and nothing lands on the holiday.
  const fEnd = addDays(mondayOf(thanksgiving(y)), -7);
  const f0 = addDays(fEnd, -84);
  const s0 = mon('02-02', n);
  const fw = (k: number) => addDays(f0, 7 * k);
  const sw = (k: number) => addDays(s0, 7 * k);

  const conference = sw(11);
  const tournaments: PlannedTournament[] = [
    t('t-fall-1', 'Harbor Lakes Collegiate', 'lakes', fw(3), 'fall'),
    t('t-fall-2', 'Whispering Pines Invitational', 'pines', fw(5), 'fall'),
    t('t-fall-3', 'Stonegate Fall Classic', 'links', fw(7), 'fall'),
    t('t-fall-4', 'Sandhill Dunes Intercollegiate', 'dunes', fw(9), 'fall'),
    t('t-fall-5', 'Twin Oaks Fall Finale', 'oaks', fw(11), 'fall'),
    t('t-spring-1', 'Harbor Lakes Spring Opener', 'lakes', sw(0), 'spring', { springOpener: true }),
    t('t-spring-2', 'Whispering Pines Spring Invitational', 'pines', sw(3), 'spring'),
    t('t-spring-3', 'Stonegate Collegiate', 'links', sw(7), 'spring'),
    t('t-spring-4', 'Twin Oaks Spring Classic', 'oaks', sw(9), 'spring'),
    {
      ...t('t-spring-5', 'Conference Championship', 'dunes', conference, 'spring'),
      days: [conference, addDays(conference, 1), addDays(conference, 2)],
      teeTimes: ['08:00', '08:00', '08:00'],
      eventKind: 'conference',
      host: 'Conference office',
    },
  ];

  // The late-fall qualifier for the spring opener runs across mid-November:
  // one round on the Thursday of the last tournament week, three the week
  // after. Inside it the demo shows a live qualifier, with the bubble player
  // fighting for the last lineup spot.
  const springOpenerQ = [addDays(fw(11), 3), ...mwf(fw(12))];

  const qualifiers: PlannedQualifier[] = [
    { key: 'q-fall-1', name: 'Fall qualifier 1', venueKey: 'home', days: mwf(fw(0)), forTournamentKey: 't-fall-1', spots: 1 },
    { key: 'q-fall-2', name: 'Fall qualifier 2', venueKey: 'home', days: mwf(fw(4)), forTournamentKey: 't-fall-2', spots: 1 },
    { key: 'q-fall-3', name: 'Fall qualifier 3', venueKey: 'home', days: mwf(fw(6)), forTournamentKey: 't-fall-3', spots: 1 },
    { key: 'q-fall-4', name: 'Fall qualifier 4', venueKey: 'home', days: [fw(10), addDays(fw(10), 2)], forTournamentKey: 't-fall-5', spots: 1 },
    { key: 'q-spring-opener', name: 'Spring opener qualifier', venueKey: 'home', days: springOpenerQ, forTournamentKey: 't-spring-1', spots: 2 },
    { key: 'q-spring-2', name: 'Spring qualifier 2', venueKey: 'home', days: mwf(sw(2)), forTournamentKey: 't-spring-2', spots: 1 },
    { key: 'q-spring-3', name: 'Spring qualifier 3', venueKey: 'home', days: mwf(sw(6)), forTournamentKey: 't-spring-3', spots: 1 },
    { key: 'q-spring-4', name: 'Spring qualifier 4', venueKey: 'home', days: mwf(sw(8)), forTournamentKey: 't-spring-4', spots: 1 },
  ];
  // Fall 4 has no qualifier of its own: its lineup carries over from Fall 3.

  const competitionDays = new Set<string>([...tournaments.flatMap((x) => x.days), ...qualifiers.flatMap((x) => x.days)]);
  // Travel days before away events are not practice days either.
  for (const x of tournaments) competitionDays.add(addDays(x.days[0]!, -1));

  const fall = { from: addDays(f0, -6), to: addDays(fEnd, 4) };
  const spring = { from: `${n}-01-12`, to: `${n}-04-30` };

  const practiceDays: string[] = [];
  const practiceRoundDays: string[] = [];
  const meetingDays: string[] = [];
  for (const term of [fall, spring]) {
    for (let d = term.from; d <= term.to; d = addDays(d, 1)) {
      const dow = weekday(d);
      if (dow === 0 || dow === 6 || dow === 5) continue;
      if (isBreak(d, y) || competitionDays.has(d)) continue;
      practiceDays.push(d);
      // A practice round on the course most Thursdays without a competition
      // that week, and on Tuesdays too in the January build-up to the opener.
      const week = mondayOf(d);
      const busyWeek = [...competitionDays].some((c) => mondayOf(c) === week);
      const buildUp = term === spring && d < s0;
      if (!busyWeek && (dow === 4 || (dow === 2 && buildUp))) practiceRoundDays.push(d);
      if (dow === 1 && (daysBetween(term.from, d) % 14 < 7)) meetingDays.push(d);
    }
  }
  // Preseason: two practice rounds in the first week.
  practiceRoundDays.unshift(...[onOrAfter(fall.from, 2), onOrAfter(fall.from, 3)].filter((d) => !practiceRoundDays.includes(d)));
  practiceRoundDays.sort();

  return { year, tournaments, qualifiers, practiceRoundDays, practiceDays, meetingDays, fall, spring };
}

/** The tournament a qualifier key settles. */
export function tournamentFor(plan: SeasonPlan, q: PlannedQualifier): PlannedTournament {
  const found = plan.tournaments.find((x) => x.key === q.forTournamentKey);
  if (!found) throw new Error(`Qualifier ${q.key} points at an unknown tournament`);
  return found;
}
