/**
 * Launch readiness F-03: the hour limits a team's practice-hours log is read against, per association and part of the
 * season. Every NCAA figure here was read in the 2026-27 Division I, II and III Manuals (NCAA LSDBi, reports 90008, 90010
 * and 90011) on 15 Nov 2026, and each limit carries the bylaw it comes from. No NAIA figure is claimed: an NAIA team, or any
 * team whose rules differ, sets its own limits (Custom). Pure: no React, no reads.
 */

import type { HoursDivision, HoursRange, HoursSettings } from '@/lib/golf/practice-hours';

export {
  checkHoursAdjustment,
  checkHoursSettings,
  roundHours,
  type HoursField as ChHoursField,
  type HoursProblem as ChHoursProblem,
} from '@/lib/golf/practice-hours';

export type ChHoursDivision = HoursDivision;
export type ChHoursRange = HoursRange;
/** What a team stores (golf_team_hours_settings, held migration), or the defaults until it can. */
export type ChHoursSettings = HoursSettings;

/**
 * Golf's parts of the year. Both NCAA championships are in the spring, so a declared spring season is the championship
 * segment and a declared fall season the nonchampionship segment; a week in neither is outside the playing season.
 */
export type ChHoursSegment = 'championship' | 'nonchampionship' | 'outside';

export interface ChHoursCite {
  /** What the bylaw sets, in the coach's words. */
  rule: string;
  bylaw: string;
}

export interface ChHoursLimits {
  division: ChHoursDivision;
  segment: ChHoursSegment;
  /** No season dates are set, so the week is read as in season. */
  segmentAssumed: boolean;
  /** Countable hours a day; null is no daily limit. */
  day: number | null;
  /** Countable hours a week; null is no weekly limit. */
  week: number | null;
  /** Days a week with no countable activity. */
  daysOff: number;
  /** A competition day counts as this many hours, whatever it ran. */
  competitionDay: number;
  /** A golf practice round may run past the daily limit; the week's limit still applies. */
  practiceRoundExempt: boolean;
  /** Division I: a day with a practice round and other activity stays at or under this. */
  practiceRoundDay: number | null;
  /** A practice round at the tournament site the day before a tournament counts as this many hours. */
  practiceRoundEve: number | null;
  /** No countable activity after the competition on its last day. */
  noActivityAfterCompetition: boolean;
  /** A day with only travel may be the day off. */
  travelDayIsOff: boolean;
  /** No countable activity on the Tuesday after the first Monday in November. */
  civicDay: boolean;
  /** Outside the season, of the week's hours no more than this many on skill instruction or team activities (stated, not checked). */
  skillWeek: number | null;
  /** What the limits come from: "NCAA Division I Manual 2026-27", or "Your limits". */
  source: string;
  cites: ChHoursCite[];
  /** The bylaw behind each warning the log can raise, where an association sets it. */
  bylaws: Partial<Record<ChHoursFlagKind, string>>;
}

/** What the log warns about: over the day, a practice-round day over its total, over the week, too few days off, activity after competition, the civic day. */
export type ChHoursFlagKind = 'day' | 'roundDay' | 'week' | 'dayOff' | 'afterCompetition' | 'civic';

export const HOURS_DIVISIONS: ReadonlyArray<{ value: ChHoursDivision; label: string }> = [
  { value: 'd1', label: 'NCAA Division I' },
  { value: 'd2', label: 'NCAA Division II' },
  { value: 'd3', label: 'NCAA Division III' },
  { value: 'naia', label: 'NAIA' },
  { value: 'custom', label: 'Custom limits' },
];

export const SEGMENT_LABEL: Record<ChHoursSegment, string> = {
  championship: 'Playing season',
  nonchampionship: 'Fall season',
  outside: 'Outside the season',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const weekdayName = (n: number): string => WEEKDAYS[((n % 7) + 7) % 7]!;

export const DEFAULT_HOURS_SETTINGS: ChHoursSettings = {
  division: 'd1',
  autonomy: false,
  weekStartsOn: 1,
  fall: null,
  spring: null,
  custom: { day: null, week: null, daysOff: 1 },
};

/** A team's division as Settings, Team writes it ("NCAA D1", "Division II", "NAIA"), or null when it says none we know. */
export function divisionFromText(text: string | null | undefined): ChHoursDivision | null {
  const t = (text ?? '').toLowerCase();
  if (/naia/.test(t)) return 'naia';
  if (/njcaa|juco|junior|cccaa|nccaa/.test(t)) return null;
  const m = t.match(/(?:division|div|d)[\s._-]*(iii|ii|i|1|2|3)(?![a-z0-9])/) ?? t.trim().match(/^(iii|ii|i|1|2|3)$/);
  const v = m?.[1];
  return v === '1' || v === 'i' ? 'd1' : v === '2' || v === 'ii' ? 'd2' : v === '3' || v === 'iii' ? 'd3' : null;
}

const inRange = (date: string, r: ChHoursRange | null) => !!r && date >= r.from && date <= r.to;

/** Which part of the season a week is in, read on its first day (an institution's week is fixed for the segment). */
export function segmentOf(settings: Pick<ChHoursSettings, 'fall' | 'spring'>, weekFirstDay: string): { segment: ChHoursSegment; assumed: boolean } {
  if (!settings.fall && !settings.spring) return { segment: 'championship', assumed: true };
  if (inRange(weekFirstDay, settings.spring)) return { segment: 'championship', assumed: false };
  if (inRange(weekFirstDay, settings.fall)) return { segment: 'nonchampionship', assumed: false };
  return { segment: 'outside', assumed: false };
}

const D1 = 'NCAA Division I Manual 2026-27';
const D2 = 'NCAA Division II Manual 2026-27';
const D3 = 'NCAA Division III Manual 2026-27';

/** What a week is read against: the team's settings and the part of the season its first day falls in. */
export function limitsFor(settings: ChHoursSettings, weekFirstDay: string): ChHoursLimits {
  const { segment, assumed } = segmentOf(settings, weekFirstDay);
  const base = { division: settings.division, segment, segmentAssumed: assumed };
  const none = {
    day: null,
    week: null,
    daysOff: 0,
    competitionDay: 3,
    practiceRoundExempt: false,
    practiceRoundDay: null,
    practiceRoundEve: null,
    noActivityAfterCompetition: false,
    travelDayIsOff: true,
    civicDay: false,
    skillWeek: null,
    bylaws: {},
  };
  const inSeason = segment !== 'outside';

  if (settings.division === 'd1') {
    if (!inSeason) {
      return {
        ...base,
        ...none,
        week: 8,
        daysOff: 2,
        civicDay: true,
        skillWeek: 4,
        source: D1,
        bylaws: { week: '17.1.7.2', dayOff: '17.1.7.5', civic: '17.1.7.6' },
        cites: [
          { rule: '8 hours a week outside the playing season, no more than 4 of them on skill instruction', bylaw: '17.1.7.2' },
          { rule: 'Two days off a week outside the playing season', bylaw: '17.1.7.5' },
          { rule: 'No countable activity on the civic engagement day, the Tuesday after the first Monday in November', bylaw: '17.1.7.6' },
        ],
      };
    }
    return {
      ...base,
      day: 4,
      week: 20,
      daysOff: 1,
      competitionDay: 3,
      practiceRoundExempt: true,
      practiceRoundDay: 5,
      practiceRoundEve: 3,
      noActivityAfterCompetition: true,
      travelDayIsOff: !settings.autonomy,
      civicDay: true,
      skillWeek: null,
      source: D1,
      bylaws: { day: '17.1.7.1', week: '17.1.7.1', roundDay: '17.1.7.1.1', dayOff: '17.1.7.4', afterCompetition: '17.1.7.3.2.1', civic: '17.1.7.6' },
      cites: [
        { rule: '4 hours a day and 20 a week in the playing season', bylaw: '17.1.7.1' },
        {
          rule: 'A golf practice round may run past 4 hours; with other activity that day, the day stays at 5. A practice round at the tournament site the day before counts 3',
          bylaw: '17.1.7.1.1',
        },
        { rule: 'A competition day counts 3 hours, whatever it ran', bylaw: '17.1.7.3.2' },
        { rule: 'No countable activity after competition, except between rounds of a multiday tournament', bylaw: '17.1.7.3.2.1' },
        { rule: 'One day off a week in the playing season', bylaw: '17.1.7.4' },
        settings.autonomy
          ? { rule: 'Autonomy conferences: a travel day is not a day off', bylaw: '17.1.7.7.1' }
          : { rule: 'A travel day with no countable activity may be the day off', bylaw: '17.1.7.4.1' },
        { rule: 'No countable activity on the civic engagement day, the Tuesday after the first Monday in November', bylaw: '17.1.7.6' },
      ],
    };
  }

  if (settings.division === 'd2') {
    if (!inSeason) {
      return {
        ...base,
        ...none,
        week: 8,
        daysOff: 2,
        civicDay: true,
        skillWeek: 4,
        source: D2,
        bylaws: { week: '17.1.6.3.1-(b)', dayOff: '17.1.6.7', civic: '17.1.6.8' },
        cites: [
          { rule: '8 hours a week outside the playing season, no more than 4 of them on team activities', bylaw: '17.1.6.3.1-(b)' },
          { rule: 'Two days off a week outside the playing season', bylaw: '17.1.6.7' },
          { rule: 'No countable activity on the civic engagement day, the Tuesday after the first Monday in November', bylaw: '17.1.6.8' },
        ],
      };
    }
    const fall = segment === 'nonchampionship';
    return {
      ...base,
      day: 4,
      week: 20,
      daysOff: fall ? 2 : 1,
      competitionDay: 3,
      practiceRoundExempt: true,
      practiceRoundDay: null,
      practiceRoundEve: 3,
      noActivityAfterCompetition: true,
      travelDayIsOff: true,
      civicDay: true,
      skillWeek: null,
      source: D2,
      bylaws: fall
        ? { day: '17.1.6.2.1', week: '17.1.6.2.1', dayOff: '17.1.6.6', afterCompetition: '17.1.6.4.2.2', civic: '17.1.6.8' }
        : { day: '17.1.6.1', week: '17.1.6.1', dayOff: '17.1.6.5', afterCompetition: '17.1.6.4.2.2', civic: '17.1.6.8' },
      cites: [
        fall
          ? {
              rule: 'Golf in the nonchampionship segment: 4 hours a day and 20 a week; a practice round may run past 4 hours and the day before at the tournament site counts 3',
              bylaw: '17.1.6.2.1',
            }
          : {
              rule: '4 hours a day and 20 a week; a practice round may run past 4 hours and the day before at the tournament site counts 3',
              bylaw: '17.1.6.1.1',
            },
        { rule: 'A competition day counts 3 hours, whatever it ran', bylaw: '17.1.6.4.2' },
        { rule: 'No practice after competition, except between rounds of a multiday tournament', bylaw: '17.1.6.4.2.2' },
        fall
          ? { rule: 'Two days off a week in the nonchampionship segment', bylaw: '17.1.6.6' }
          : { rule: 'One day off a week in the playing season', bylaw: '17.1.6.5' },
        { rule: 'A travel day with no countable activity may be the day off', bylaw: '17.1.6.5.1' },
        { rule: 'No countable activity on the civic engagement day, the Tuesday after the first Monday in November', bylaw: '17.1.6.8' },
      ],
    };
  }

  if (settings.division === 'd3') {
    return inSeason
      ? {
          ...base,
          ...none,
          daysOff: 1,
          source: D3,
          bylaws: { dayOff: '17.1.4.1' },
          cites: [{ rule: 'One day off a week in the playing season; Division III sets no hour limit', bylaw: '17.1.4.1' }],
        }
      : { ...base, ...none, source: D3, cites: [] };
  }

  if (settings.division === 'naia') {
    return { ...base, ...none, source: 'No limits applied: choose Custom to set your own', cites: [] };
  }

  const c = settings.custom;
  return {
    ...base,
    ...none,
    day: positiveOrNull(c.day),
    week: positiveOrNull(c.week),
    daysOff: Math.max(0, Math.min(7, Math.round(c.daysOff || 0))),
    source: 'Your limits',
    cites: [],
  };
}

function positiveOrNull(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

/** The civic engagement day of a year: the Tuesday after the first Monday in November (DI 17.1.7.6, DII 17.1.6.8). */
export function civicDayOf(year: number): string {
  const first = new Date(Date.UTC(year, 10, 1, 12));
  const toMonday = (8 - first.getUTCDay()) % 7;
  const tuesday = 1 + toMonday + 1;
  return `${year}-11-${String(tuesday).padStart(2, '0')}`;
}

/** A setting's limits in one line: "4 a day · 20 a week · 1 day off", or "No hour limits · 1 day off". */
export function limitsLine(l: Pick<ChHoursLimits, 'day' | 'week' | 'daysOff'>): string {
  const parts: string[] = [];
  if (l.day != null) parts.push(`${fmtHours(l.day)} a day`);
  if (l.week != null) parts.push(`${fmtHours(l.week)} a week`);
  if (!parts.length) parts.push('No hour limits');
  if (l.daysOff > 0) parts.push(l.daysOff === 1 ? '1 day off' : `${l.daysOff} days off`);
  return parts.join(' · ');
}

/** Hours as the log writes them: "4", "2.5", "1.75". Never a trailing zero. */
export function fmtHours(h: number): string {
  return String(Math.round(h * 100) / 100);
}
