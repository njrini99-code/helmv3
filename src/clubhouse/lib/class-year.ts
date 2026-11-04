import { isoDay } from './dates';
import { seasonStartOfDay } from './season-start';

// Plain (not server-only, unlike data/season.ts): a client row can word a year line.
const SEASON_DEFAULT_TZ = 'America/New_York';

/** Today on the team's calendar. */
function teamDay(now: Date, tz: string): string {
  return isoDay(now, tz);
}

export type ChYearKey = 'sr' | 'jr' | 'so' | 'fr';

const YEARS: readonly { key: ChYearKey; label: string }[] = [
  { key: 'sr', label: 'Senior' },
  { key: 'jr', label: 'Junior' },
  { key: 'so', label: 'Sophomore' },
  { key: 'fr', label: 'Freshman' },
];

function yearOf(graduationYear: number | null | undefined, now: Date, tz: string) {
  if (!graduationYear) return null;
  // The team's season, which turns over on 1 August on the team's calendar: grad 2027 is a Senior for 2026-27.
  const academicEnd = Number(seasonStartOfDay(teamDay(now, tz)).slice(0, 4)) + 1;
  return YEARS[graduationYear - academicEnd] ?? null;
}

/** The coin's colour: one of the four years, or null (past or far grad years, or none), which keep the neutral coin. */
export function classYearKey(graduationYear: number | null | undefined, now = new Date(), tz: string = SEASON_DEFAULT_TZ): ChYearKey | null {
  return yearOf(graduationYear, now, tz)?.key ?? null;
}

/**
 * The year's name, null outside the four years: nothing invented. Behind the lane's flag; `data/season.ts` `classYearLabel`
 * still answers "Class of N" for flag-off screens and every other caller.
 */
export function classYearName(graduationYear: number | null | undefined, now = new Date(), tz: string = SEASON_DEFAULT_TZ): string | null {
  return yearOf(graduationYear, now, tz)?.label ?? null;
}

/** "Junior · Class of 2028"; "Class of 2031" once when the label is already that; null with neither. Never says it twice. */
export function classYearLine(classYear: string | null | undefined, graduationYear: number | null | undefined): string | null {
  const grad = graduationYear ? `Class of ${graduationYear}` : null;
  const label = classYear?.trim() || null;
  if (!label) return grad;
  if (!grad || label === grad) return label;
  return `${label} · ${grad}`;
}

/**
 * The line a player's year chip and sub-line read, behind the lane's flag: "Junior · Class of 2028" inside the four years, "Class of
 * 2031" once when the year is further out, and null for a past or missing year, so no "Class of 2026" is invented for an active player.
 */
export function classYearLineFor(graduationYear: number | null | undefined, now = new Date(), tz: string = SEASON_DEFAULT_TZ): string | null {
  if (!graduationYear) return null;
  const year = yearOf(graduationYear, now, tz);
  if (year) return classYearLine(year.label, graduationYear);
  const academicEnd = Number(seasonStartOfDay(teamDay(now, tz)).slice(0, 4)) + 1;
  return graduationYear > academicEnd ? classYearLine(null, graduationYear) : null;
}
