import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Launch readiness F-03, the practice-hours (CARA) log: what a team stores about its hours and how a coach changes how an
 * event counts (held migration 20261115232000), shared by Clubhouse's Practice hours page and its saves
 * (src/app/golf/actions/hours.ts). The checks here are the table's own, so the sheet and the save refuse the same values.
 * The tables are untyped until the migration is applied and the types regenerate: `hoursTables` is the one cast, as
 * Practice's practiceTables is.
 */

export type HoursDivision = 'd1' | 'd2' | 'd3' | 'naia' | 'custom';
export const HOURS_DIVISION_IDS: readonly HoursDivision[] = ['d1', 'd2', 'd3', 'naia', 'custom'];

export interface HoursRange {
  from: string;
  to: string;
}

export interface HoursSettings {
  division: HoursDivision;
  /** Division I autonomy conference rules ([A] in the Manual): a travel day is never a day off (17.1.7.7.1). */
  autonomy: boolean;
  /** The team's week: the day it starts, 0 Sunday to 6 Saturday (any seven consecutive days, fixed for the segment). */
  weekStartsOn: number;
  /** The declared playing season, fall (nonchampionship) and spring (championship). Neither set: every week is in season. */
  fall: HoursRange | null;
  spring: HoursRange | null;
  /** Custom only: the team's own limits. */
  custom: { day: number | null; week: number | null; daysOff: number };
}

/** A coach's change to how one event counts, for every player on it. */
export interface HoursAdjustment {
  counted: boolean;
  /** Hours it counts for each player on it; null keeps the drafted figure. */
  hours: number | null;
  note: string | null;
}

/** A field of the limits sheet a check can point at. */
export type HoursField = 'division' | 'weekStartsOn' | 'fall' | 'spring' | 'day' | 'week' | 'daysOff' | 'untimed';

export interface HoursProblem<F extends string = HoursField> {
  field: F;
  message: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (d: string) => ISO_DATE.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
const daysApart = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const hoursOk = (v: number, max: number, zero = false) => Number.isFinite(v) && (zero ? v >= 0 : v > 0) && v <= max;

/** Hours as the table keeps them (numeric 4,2): to the hundredth. */
export const roundHours = (v: number): number => Math.round(v * 100) / 100;

/**
 * The limits sheet's checks, the same ones the save runs and the table's own checks hold (held migration 20261115232000):
 * the first problem, with the field it belongs to, or null. A season is both dates, the first on or before the last, and
 * at most a year; the fall and spring seasons can't overlap. Custom limits: up to 24 a day, 168 a week, 0 to 7 days off.
 * The untimed standard is more than 0 and up to 12.
 */
export function checkHoursSettings(s: HoursSettings, untimedHours: number | null): HoursProblem | null {
  if (!HOURS_DIVISION_IDS.includes(s.division)) return { field: 'division', message: 'Pick your association.' };
  if (!Number.isInteger(s.weekStartsOn) || s.weekStartsOn < 0 || s.weekStartsOn > 6)
    return { field: 'weekStartsOn', message: 'Pick the day your week starts.' };
  for (const key of ['fall', 'spring'] as const) {
    const r = s[key];
    if (!r) continue;
    const name = key === 'fall' ? 'fall' : 'spring';
    if (!realDate(r.from) || !realDate(r.to)) return { field: key, message: `Give the ${name} season a first and a last day.` };
    if (r.from > r.to) return { field: key, message: `The ${name} season’s last day is before its first.` };
    if (daysApart(r.from, r.to) > 366) return { field: key, message: `The ${name} season is longer than a year.` };
  }
  if (s.fall && s.spring && s.fall.from <= s.spring.to && s.spring.from <= s.fall.to)
    return { field: 'spring', message: 'The fall and spring seasons overlap. A day can be in one of them.' };
  if (s.division === 'custom') {
    if (s.custom.day != null && !hoursOk(s.custom.day, 24)) return { field: 'day', message: 'A day’s limit is more than 0 and up to 24 hours.' };
    if (s.custom.week != null && !hoursOk(s.custom.week, 168)) return { field: 'week', message: 'A week’s limit is more than 0 and up to 168 hours.' };
    if (s.custom.day != null && s.custom.week != null && s.custom.week < s.custom.day)
      return { field: 'week', message: 'The week’s limit is less than one day’s.' };
    if (!Number.isInteger(s.custom.daysOff) || s.custom.daysOff < 0 || s.custom.daysOff > 7) return { field: 'daysOff', message: 'Days off are 0 to 7.' };
  }
  if (untimedHours != null && !hoursOk(untimedHours, 12))
    return { field: 'untimed', message: 'Untimed practices count more than 0 and up to 12 hours, or leave it empty.' };
  return null;
}

/** A change to how one event counts: up to 24 hours (0 is allowed: it counts, for nothing), a note of up to 280 characters. */
export function checkHoursAdjustment(a: { counted: boolean; hours: number | null; note: string | null }): HoursProblem<'hours' | 'note'> | null {
  if (a.counted && a.hours != null && !hoursOk(a.hours, 24, true)) return { field: 'hours', message: 'Hours are 0 to 24.' };
  if (a.note != null && a.note.length > 280) return { field: 'note', message: 'Keep the note to 280 characters.' };
  return null;
}

// ── The store ──

export interface HoursSettingsRow {
  team_id: string;
  division: string;
  autonomy: boolean;
  week_starts_on: number;
  fall_from: string | null;
  fall_to: string | null;
  spring_from: string | null;
  spring_to: string | null;
  custom_day_hours: number | string | null;
  custom_week_hours: number | string | null;
  custom_days_off: number;
  untimed_hours: number | string | null;
}

export interface HoursAdjustmentRow {
  event_id: string;
  counted: boolean;
  hours: number | string | null;
  note: string | null;
}

export function hoursTables(sb: SupabaseClient<Database>): SupabaseClient {
  return sb as unknown as SupabaseClient;
}

/** The table isn't there (Postgres 42P01, or PostgREST's schema cache PGRST205): the migration is still held. */
const MISSING = new Set(['42P01', 'PGRST205']);
export const isHoursStoreMissing = (code: string | null | undefined) => !!code && MISSING.has(code);

const DIVISIONS: ReadonlySet<string> = new Set(HOURS_DIVISION_IDS);

/** numeric arrives from PostgREST as a string or a number. */
export const numOf = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A stored row as settings; a value the table's checks would refuse falls back to its default. */
export function settingsFromRow(row: HoursSettingsRow): { settings: HoursSettings; untimedHours: number | null } {
  const range = (from: string | null, to: string | null) => (from && to && from <= to ? { from, to } : null);
  return {
    settings: {
      division: (DIVISIONS.has(row.division) ? row.division : 'd1') as HoursDivision,
      autonomy: !!row.autonomy,
      weekStartsOn: Number.isInteger(row.week_starts_on) && row.week_starts_on >= 0 && row.week_starts_on <= 6 ? row.week_starts_on : 1,
      fall: range(row.fall_from, row.fall_to),
      spring: range(row.spring_from, row.spring_to),
      custom: {
        day: numOf(row.custom_day_hours),
        week: numOf(row.custom_week_hours),
        daysOff: Number.isInteger(row.custom_days_off) ? row.custom_days_off : 1,
      },
    },
    untimedHours: numOf(row.untimed_hours),
  };
}

/** Settings as the row the save writes. Custom limits are kept only for Custom; autonomy only for Division I. */
export function settingsToRow(
  teamId: string,
  s: HoursSettings,
  untimedHours: number | null,
  userId: string,
): HoursSettingsRow & { updated_by: string; updated_at: string } {
  const custom = s.division === 'custom';
  return {
    team_id: teamId,
    division: s.division,
    autonomy: s.division === 'd1' && s.autonomy,
    week_starts_on: s.weekStartsOn,
    fall_from: s.fall?.from ?? null,
    fall_to: s.fall?.to ?? null,
    spring_from: s.spring?.from ?? null,
    spring_to: s.spring?.to ?? null,
    custom_day_hours: custom && s.custom.day != null ? roundHours(s.custom.day) : null,
    custom_week_hours: custom && s.custom.week != null ? roundHours(s.custom.week) : null,
    custom_days_off: custom ? s.custom.daysOff : 1,
    untimed_hours: untimedHours != null ? roundHours(untimedHours) : null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
}

export function adjustmentFromRow(r: HoursAdjustmentRow): HoursAdjustment {
  return { counted: !!r.counted, hours: numOf(r.hours), note: r.note };
}
