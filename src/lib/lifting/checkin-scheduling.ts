// =============================================================================
// src/lib/lifting/checkin-scheduling.ts
//
// Helm Lifting Lab — Check-In Schedule Materialization (spec §4, §9)
//
// PURE date logic: no DB, no React, no async.
// Given a schedule descriptor and a date window, returns every due date.
//
// The server action `materializeSorenessCheckRequests` (and the weight
// equivalent) calls materializeWindow() to expand a schedule into concrete
// due-date rows before inserting them into the *_requests tables.
//
// Key invariant: all dates are handled as local-calendar ISO strings
// (YYYY-MM-DD). UTC conversion is the caller's responsibility when pairing
// dates with timestamps. This module never touches timestamps.
// =============================================================================

import type { FrequencyType } from '@/lib/types/helm-lifting-checkins';

// -----------------------------------------------------------------------------
// Input type
//
// Mirrors the columns shared by both schedule tables that control recurrence.
// Does NOT extend the full SorenessCheckSchedule to avoid coupling.
// -----------------------------------------------------------------------------

export interface ScheduleWindow {
  /** Recurrence mode. */
  readonly frequency_type: FrequencyType;
  /**
   * ISO day-of-week integers: 0 = Sunday … 6 = Saturday.
   * Required for 'weekly' and 'custom'. Ignored for 'once' and 'daily'.
   */
  readonly days_of_week: number[] | null;
  /** Schedule start date (YYYY-MM-DD). Due dates are never before this. */
  readonly start_date: string;
  /**
   * Schedule end date (YYYY-MM-DD), inclusive. Null = open-ended; the
   * caller's toIso parameter acts as the upper bound in that case.
   */
  readonly end_date: string | null;
}

// -----------------------------------------------------------------------------
// Internal date helpers
//
// All computation runs on local-midnight Dates derived from ISO strings so that
// DST and UTC offsets never shift the calendar date sideways.
// -----------------------------------------------------------------------------

/** Parse YYYY-MM-DD into a Date at local midnight. */
function fromIso(iso: string): Date {
  const parts = iso.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return new Date(y, m - 1, d);
}

/** Format a local-midnight Date back to YYYY-MM-DD. */
function toIso(date: Date): string {
  const y = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Advance a Date by N calendar days (mutates; returns self for chaining). */
function addDays(date: Date, n: number): Date {
  date.setDate(date.getDate() + n);
  return date;
}

/** Return a new Date for the given ISO string, cloned. */
function cloneFromIso(iso: string): Date {
  return fromIso(iso);
}

// -----------------------------------------------------------------------------
// materializeWindow
//
// Core function: expand a schedule descriptor into every ISO due date that
// falls within [fromIso, toIso] (both inclusive), bounded also by
// [schedule.start_date, schedule.end_date].
//
// Returns dates in ascending order, deduplicated.
// Empty array if no dates land in the intersection.
// -----------------------------------------------------------------------------

/**
 * Materialize a schedule into concrete due dates for a window.
 *
 * @param schedule  The recurrence descriptor (from either schedule table).
 * @param fromIso   Window start, YYYY-MM-DD (e.g. today).
 * @param toIso     Window end, YYYY-MM-DD (e.g. today + 30 days).
 * @returns         Sorted, deduplicated ISO date strings within the window.
 */
export function materializeWindow(
  schedule: ScheduleWindow,
  fromIso: string,
  toIso: string,
): string[] {
  // ── Resolve effective [lo, hi] bounding the output ─────────────────────────
  // lo = max(schedule.start_date, fromIso)
  // hi = min(schedule.end_date ?? toIso, toIso)
  const lo = schedule.start_date > fromIso ? schedule.start_date : fromIso;
  const rawHi = schedule.end_date && schedule.end_date < toIso ? schedule.end_date : toIso;
  const hi = rawHi;

  if (lo > hi) return []; // window is empty or ends before schedule starts

  const loDate = cloneFromIso(lo);
  const hiDate = cloneFromIso(hi);

  switch (schedule.frequency_type) {
    case 'once':
      // Emit start_date if it falls in [lo, hi].
      // The "once" schedule has one due date: start_date.
      return schedule.start_date >= lo && schedule.start_date <= hi
        ? [schedule.start_date]
        : [];

    case 'daily':
      // Every calendar day from lo to hi, inclusive.
      return eachDayInRange(loDate, hiDate);

    case 'weekly':
    case 'custom': {
      // Both use days_of_week to select which weekdays fire.
      // 'weekly' semantically means "every week on these days";
      // 'custom' is the same mechanism with an arbitrary dow set.
      const dows = schedule.days_of_week;
      if (!dows || dows.length === 0) {
        // Misconfigured schedule — return nothing rather than exploding.
        return [];
      }
      return eachSelectedWeekday(loDate, hiDate, dows);
    }

    default: {
      // Exhaustive check: frequency_type is a known union; this branch
      // guards against future DB rows with an unexpected value.
      const _never: never = schedule.frequency_type;
      void _never;
      return [];
    }
  }
}

// -----------------------------------------------------------------------------
// eachDayInRange — helper for 'daily'
// -----------------------------------------------------------------------------

/** Return ISO strings for every day in [start, end] inclusive. */
function eachDayInRange(start: Date, end: Date): string[] {
  const result: string[] = [];
  const cur = new Date(start); // clone so we don't mutate the argument
  const endTime = end.getTime();

  while (cur.getTime() <= endTime) {
    result.push(toIso(cur));
    addDays(cur, 1);
  }
  return result;
}

// -----------------------------------------------------------------------------
// eachSelectedWeekday — helper for 'weekly' and 'custom'
// -----------------------------------------------------------------------------

/**
 * Walk day-by-day from start to end (inclusive) and emit only the dates whose
 * local weekday (Date.getDay()) appears in the allowedDows set.
 *
 * Walking day-by-day is simple and correct; the window is always bounded by
 * the caller so performance is fine (typical: 1–90 days).
 */
function eachSelectedWeekday(
  start: Date,
  end: Date,
  allowedDows: readonly number[],
): string[] {
  const dowSet = new Set(allowedDows);
  const result: string[] = [];
  const cur = new Date(start);
  const endTime = end.getTime();

  while (cur.getTime() <= endTime) {
    if (dowSet.has(cur.getDay())) {
      result.push(toIso(cur));
    }
    addDays(cur, 1);
  }
  return result;
}

// -----------------------------------------------------------------------------
// Convenience helpers callers can use without re-implementing date math
// -----------------------------------------------------------------------------

/**
 * Returns true if a given ISO date string falls within the schedule's active
 * window (start_date ≤ date ≤ end_date, or end_date is null).
 */
export function isDateInScheduleWindow(schedule: ScheduleWindow, isoDate: string): boolean {
  if (isoDate < schedule.start_date) return false;
  if (schedule.end_date && isoDate > schedule.end_date) return false;
  return true;
}

/**
 * Given a schedule, returns the next due date on or after `fromIso`.
 * Returns null if the schedule has ended or no date lands in the window.
 *
 * Useful for UX: "Next due: Monday, June 30."
 */
export function nextDueDate(schedule: ScheduleWindow, fromIso: string): string | null {
  // Look 90 days ahead as a reasonable horizon
  const lookAheadDays = 90;
  const toDate = addDays(cloneFromIso(fromIso), lookAheadDays);
  const dates = materializeWindow(schedule, fromIso, toIso(toDate));
  return dates[0] ?? null;
}

/**
 * Returns a human-readable recurrence summary string for coach UIs.
 * Examples: "Daily", "Mon, Wed, Fri", "Once on Jun 25", "Custom (3 days/wk)"
 */
export function recurrenceLabel(schedule: ScheduleWindow): string {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  switch (schedule.frequency_type) {
    case 'once':
      return `Once on ${schedule.start_date}`;
    case 'daily':
      return 'Daily';
    case 'weekly': {
      if (!schedule.days_of_week?.length) return 'Weekly';
      const names = schedule.days_of_week
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d] ?? `Day${d}`)
        .join(', ');
      return names;
    }
    case 'custom': {
      if (!schedule.days_of_week?.length) return 'Custom';
      const names = schedule.days_of_week
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d] ?? `Day${d}`)
        .join(', ');
      return `Custom (${names})`;
    }
    default: {
      const _never: never = schedule.frequency_type;
      void _never;
      return 'Unknown';
    }
  }
}
