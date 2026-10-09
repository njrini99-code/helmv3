/**
 * Recruiting calendar awareness (P014 C2): which recruiting period a college golf program is in on a given day, from the
 * governing bodies' own 2026-27 rule books, and nothing else. Static, typed and client-safe. Wrong data is worse than none:
 *
 * - Every entry carries its source URL and the bylaw it comes from. A division the books could not confirm has no entry,
 *   so it gets no line and no hint.
 * - Divisions without a recruiting calendar for golf say so explicitly (`calendar: 'none'`), with the rule text that says so.
 * - A day outside the season the data covers (Aug 1, 2026 to Jul 31, 2027) has no answer. It is never read as the
 *   nearest period. The file is re-authored each academic year.
 *
 * Read on 2026-10-08 from:
 * - NCAA Division I Manual 2026-27 (LSDBi report 90008), Bylaws 13.02.5, 13.1.3.1, 13.4.1, 13.17.7, 13.17.8, Figure 13-2.
 * - NCAA Division II Manual 2026-27 (LSDBi report 90010), Bylaws 13.02.10, 13.02.10.1, 13.1.3.1.
 * - NCAA Division III Manual 2026-27 (LSDBi report 90011), Bylaws 13.02.10.1, 13.4.1.1, 13.1.1.1 (no recruiting periods).
 * - naia.org, prospective high-school students ("No recruiting calendar restrictions of any kind").
 * - NJCAA Handbook and Bylaws 2026-27 (dated 9-9-26), Article VI §4 C.1, linked from njcaa.org/compliance.
 *
 * What the books say about phone and email: no period in any of these divisions restricts them. A Division I dead period
 * "remains permissible ... to communicate with (other than in person)" (13.02.5.5), and Division II allows communication
 * "at any time" (13.1.3.1). Email and Call hints therefore never come from a period. The one sourced restriction on
 * them is Division I's start date: no calls, email or recruiting materials before June 15 at the end of the prospect's
 * sophomore year (13.1.3.1, 13.4.1; golf has no exception), which `remoteContactHint` reads from the class year.
 */

export const RECRUITING_CALENDAR_AS_OF = '2026-10-08';
/** The season the dated entries cover, inclusive. A day outside it has no answer. */
export const RECRUITING_SEASON = { from: '2026-08-01', to: '2027-07-31', label: '2026–27' } as const;

export type ChDivision = 'ncaa-d1' | 'ncaa-d2' | 'ncaa-d3' | 'naia' | 'njcaa';
export type ChProgramGender = 'mens' | 'womens';

export const CH_DIVISIONS: ReadonlyArray<{ value: ChDivision; label: string; short: string }> = [
  { value: 'ncaa-d1', label: 'NCAA Division I', short: 'Division I' },
  { value: 'ncaa-d2', label: 'NCAA Division II', short: 'Division II' },
  { value: 'ncaa-d3', label: 'NCAA Division III', short: 'Division III' },
  { value: 'naia', label: 'NAIA', short: 'NAIA' },
  { value: 'njcaa', label: 'NJCAA', short: 'NJCAA' },
];
export const isDivision = (v: unknown): v is ChDivision => CH_DIVISIONS.some((d) => d.value === v);

export type ChPeriodKind = 'contact' | 'quiet' | 'dead';

/** One dated stretch, inclusive at both ends, in the program's local calendar. Segments for one program never overlap. */
export interface ChPeriod {
  from: string;
  to: string;
  kind: ChPeriodKind;
  /** What the period allows in person. Phone and email are allowed in every sourced period (see the header). */
  inPerson: 'allowed' | 'on-campus-only' | 'none';
  /** Optional local clock edges ("07:00"): Division II's signing dead period runs 7 a.m. to 7 a.m. */
  fromTime?: string;
  toTime?: string;
  /** A caveat the line must carry, such as a convention whose dates the books don't give. */
  caveat?: string;
  /** Who in-person contact reaches: the division's age rule, shown beside "in-person contact allowed". */
  ageRule?: string;
  bylaw: string;
  source: string;
}

export type ChCalendar =
  | { calendar: 'periods'; periods: ChPeriod[]; outside: string; bylaw: string; source: string }
  | { calendar: 'none'; statement: string; bylaw: string; source: string };

const D1 = 'https://web3.ncaa.org/lsdbi/reports/getReport/90008';
const D2 = 'https://web3.ncaa.org/lsdbi/reports/getReport/90010';
const D3 = 'https://web3.ncaa.org/lsdbi/reports/getReport/90011';
const NAIA = 'https://www.naia.org/student-athletes/prospective/high-school-students/';
const NJCAA = 'https://ardor-prod-media.s3.us-east-2.amazonaws.com/files/404933495157163011/6b815aea7cf842719e5deeefd7dc9310-NJCAA-Handbook---Bylaws---2026-27-9-9-26.pdf';

/** Division I's age rule: off-campus in-person contact begins Aug 1 before the prospect's junior year (13.1.1.1). */
const D1_AGE = 'from Aug 1 before junior year';
/** Division II's age rule: in-person contact begins June 15 before the prospect's junior year (13.1.1.1). */
export const D2_AGE = 'from June 15 before junior year';
const contact = (from: string, to: string, bylaw: string, caveat?: string): ChPeriod => ({
  from,
  to,
  kind: 'contact',
  inPerson: 'allowed',
  ageRule: D1_AGE,
  bylaw: `${bylaw}; 13.1.1.1`,
  source: D1,
  ...(caveat ? { caveat } : {}),
});
const dead = (from: string, to: string, bylaw: string): ChPeriod => ({ from, to, kind: 'dead', inPerson: 'none', bylaw, source: D1 });

/**
 * Division I golf, 2026-27. The initial signing date for "All Other Division I and II Sports" is Wed Nov 11, 2026
 * (Figure 13-2), so the signing-week dead period is Mon Nov 9 to Thu Nov 12. Thanksgiving is Thu Nov 26.
 */
const D1_MENS: ChPeriod[] = [
  contact('2026-08-01', '2026-11-08', '13.17.7-(a)'),
  dead('2026-11-09', '2026-11-12', '13.17.7-(a)-(1)'),
  contact('2026-11-13', '2026-11-25', '13.17.7-(a)'),
  dead('2026-11-26', '2026-11-29', '13.17.7-(b)'),
  {
    from: '2026-11-30',
    to: '2026-12-22',
    kind: 'quiet',
    inPerson: 'on-campus-only',
    caveat: 'dead during the GCAA convention; evaluations allowed at the GCAA showcase and combine',
    bylaw: '13.17.7-(c), 13.17.7-(c)-(1)',
    source: D1,
  },
  dead('2026-12-23', '2027-01-01', '13.17.7-(d)'),
  contact('2027-01-02', '2027-07-31', '13.17.7-(e)'),
];

const D1_WOMENS: ChPeriod[] = [
  contact('2026-08-01', '2026-11-08', '13.17.8-(a)'),
  dead('2026-11-09', '2026-11-12', '13.17.8-(a)-(1)'),
  contact('2026-11-13', '2026-11-25', '13.17.8-(a)'),
  dead('2026-11-26', '2026-11-29', '13.17.8-(b)'),
  contact('2026-11-30', '2026-12-23', '13.17.8-(c)', 'dead during the WGCA convention'),
  dead('2026-12-24', '2026-12-27', '13.17.8-(d)'),
  contact('2026-12-28', '2027-07-31', '13.17.8-(e)'),
];

/** Division II golf has no sport calendar; the one dead period is the 48 hours before 7 a.m. on the second Wednesday in November. */
const D2_PERIODS: ChPeriod[] = [
  { from: '2026-11-09', fromTime: '07:00', to: '2026-11-11', toTime: '07:00', kind: 'dead', inPerson: 'none', bylaw: '13.02.10.1.1-13.02.10.1.2', source: D2 },
];

export const RECRUITING_CALENDARS: Record<ChDivision, Partial<Record<ChProgramGender, ChCalendar>> & { all?: ChCalendar }> = {
  'ncaa-d1': {
    mens: { calendar: 'periods', periods: D1_MENS, outside: '', bylaw: '13.17.7', source: D1 },
    womens: { calendar: 'periods', periods: D1_WOMENS, outside: '', bylaw: '13.17.8', source: D1 },
  },
  'ncaa-d2': {
    // Outside the signing dead period there is no golf period at all: the line says so rather than inventing one.
    all: { calendar: 'periods', periods: D2_PERIODS, outside: `No golf recruiting periods in Division II · in-person contact ${D2_AGE}`, bylaw: '13.02.10; 13.1.1.1', source: D2 },
  },
  'ncaa-d3': {
    all: { calendar: 'none', statement: 'No recruiting calendar in Division III', bylaw: '13.02.10.1, 13.4.1.1 (no recruiting periods defined)', source: D3 },
  },
  naia: {
    all: { calendar: 'none', statement: 'No recruiting calendar in the NAIA', bylaw: '“No recruiting calendar restrictions of any kind”', source: NAIA },
  },
  njcaa: {
    all: { calendar: 'none', statement: 'The NJCAA sets no recruiting periods; staff may visit prospects anywhere', bylaw: 'Article VI §4 C.1', source: NJCAA },
  },
};

/** The calendar for a program, or null when the data has none for it. */
export function calendarFor(division: ChDivision, gender: ChProgramGender): ChCalendar | null {
  const c = RECRUITING_CALENDARS[division];
  return c[gender] ?? c.all ?? null;
}

/** A day key ("2026-10-08") and minutes past midnight in a time zone, so a lookup reads the coach's own calendar. */
export function localDay(now: Date, tz?: string): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const mins = (hhmm?: string) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);

/** The period covering this moment, or null (none that day, or outside the covered season). */
export function periodAt(periods: readonly ChPeriod[], at: { day: string; minutes: number }): ChPeriod | null {
  for (const p of periods) {
    if (at.day < p.from || at.day > p.to) continue;
    const start = mins(p.fromTime);
    const end = mins(p.toTime);
    if (at.day === p.from && start != null && at.minutes < start) continue;
    if (at.day === p.to && end != null && at.minutes >= end) continue;
    return p;
  }
  return null;
}

const inSeason = (day: string) => day >= RECRUITING_SEASON.from && day <= RECRUITING_SEASON.to;

const dayLabel = (day: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
const timeLabel = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 || 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'a.m.' : 'p.m.'}`;
};

export interface ChCalendarLine {
  kind: ChPeriodKind | 'none';
  /** The quiet header line. */
  text: string;
  source: string;
  bylaw: string;
}

/** The sentence for a period: what it is, what it allows in person, and through when. */
function periodLine(p: ChPeriod): string {
  const through = p.toTime ? `until ${timeLabel(p.toTime)} ${dayLabel(p.to)}` : `through ${dayLabel(p.to)}`;
  const base =
    p.kind === 'contact'
      ? `Contact period · in-person contact allowed${p.ageRule ? ` ${p.ageRule},` : ''} ${through}`
      : p.kind === 'quiet'
        ? `Quiet period · in-person contact on campus only, ${through}`
        : `Dead period · no in-person contact or visits ${through}`;
  return p.caveat ? `${base} (${p.caveat})` : base;
}

/**
 * The header line for a program on a day, or null when there is nothing sourced to say: an unknown program, a day outside
 * the covered season, or a gender that is unknown on a day when the men's and women's calendars differ.
 */
export function calendarLine(division: ChDivision, gender: ChProgramGender | null, now: Date, tz?: string): ChCalendarLine | null {
  const at = localDay(now, tz);
  if (!inSeason(at.day)) return null;
  if (!gender) {
    const m = calendarLine(division, 'mens', now, tz);
    const w = calendarLine(division, 'womens', now, tz);
    return m && w && m.text === w.text ? m : null;
  }
  const cal = calendarFor(division, gender);
  if (!cal) return null;
  if (cal.calendar === 'none') return { kind: 'none', text: cal.statement, source: cal.source, bylaw: cal.bylaw };
  const p = periodAt(cal.periods, at);
  if (p) return { kind: p.kind, text: periodLine(p), source: p.source, bylaw: p.bylaw };
  return cal.outside ? { kind: 'none', text: cal.outside, source: cal.source, bylaw: cal.bylaw } : null;
}

/**
 * Division I only: calls, email and recruiting materials may not start before June 15 at the end of the prospect's
 * sophomore year (13.1.3.1, 13.4.1). A class of Y finishes sophomore year in June of Y − 2. Null when the rule doesn't
 * apply, the class is unknown, or the day is already past it. The hint never blocks: class years can be off.
 */
export function remoteContactHint(division: ChDivision | null, classYear: number | null, now: Date, tz?: string): string | null {
  if (division !== 'ncaa-d1' || !classYear) return null;
  const opens = `${classYear - 2}-06-15`;
  if (localDay(now, tz).day >= opens) return null;
  return `Division I: no calls or email before June 15, ${classYear - 2}, the end of sophomore year`;
}

/**
 * Reads the free-text division on the team's organization (Settings writes "NCAA D1"). Conservative: only an explicit
 * NCAA division number, NAIA or NJCAA maps; anything else, including a junior-college label that isn't NJCAA, is unknown.
 */
export function parseDivision(raw: string | null | undefined): ChDivision | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/\bnjcaa\b/i.test(s)) return 'njcaa';
  if (/\bnaia\b/i.test(s)) return 'naia';
  if (/juco|junior college|cccaa|nwac|usca|nccaa/i.test(s)) return null;
  const m = /\b(?:d|div(?:ision)?\.?)\s*-?\s*(iii|ii|i|3|2|1)\b/i.exec(s);
  if (!m) return null;
  const n = m[1]!.toLowerCase();
  return n === 'i' || n === '1' ? 'ncaa-d1' : n === 'ii' || n === '2' ? 'ncaa-d2' : 'ncaa-d3';
}

export const isProgramGender = (v: unknown): v is ChProgramGender => v === 'mens' || v === 'womens';
