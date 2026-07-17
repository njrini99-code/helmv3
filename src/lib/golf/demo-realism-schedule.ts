/**
 * Pure date/time + scheduling math for scripts/refresh-golf-demo-realism.ts.
 *
 * Extracted so the trickiest parts of that script — timezone-correct local
 * hours, rolling day-offsets-from-now, and message/round re-anchoring that
 * preserves relative spacing — are unit-testable without a Supabase
 * connection. No I/O in this file; the script owns all the reads/writes.
 */

// ---------------------------------------------------------------------------
// Date/time primitives
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' for "now" as seen in `tz`. */
export function todayIsoInTz(tz: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/** UTC offset in whole hours (e.g. -4 or -5) for `tz` on a given 'YYYY-MM-DD'. */
export function tzOffsetHours(dateIso: string, tz: string): number {
  const probe = new Date(`${dateIso}T12:00:00Z`); // noon avoids DST-edge day rollover
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(probe);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
  const m = /GMT([+-]\d+)/.exec(tzName);
  const offsetStr = m?.[1];
  return offsetStr ? parseInt(offsetStr, 10) : -5;
}

/** Convert a local wall-clock time in `tz` on `dateIso` to a UTC ISO string. */
export function localToUtcIso(dateIso: string, hourLocal: number, minuteLocal: number, tz: string): string {
  const offset = tzOffsetHours(dateIso, tz);
  const base = new Date(`${dateIso}T00:00:00Z`);
  base.setUTCHours(base.getUTCHours() - offset + hourLocal, minuteLocal, 0, 0);
  return base.toISOString();
}

/** Add `days` (may be negative) to a 'YYYY-MM-DD' string, return 'YYYY-MM-DD'. */
export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole-day difference (a - b) for two 'YYYY-MM-DD' strings. */
export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${aIso}T00:00:00Z`) - Date.parse(`${bIso}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// A. Message re-timing (natural hours, spacing-preserving recency anchor)
// ---------------------------------------------------------------------------

// Alternates a 7-9am window with a 3-6pm window, varied minutes — deliberately
// not a flat hour-by-hour progression like the stale seed data it replaces.
const MORNING_HOURS = [7, 8, 9] as const;
const AFTERNOON_HOURS = [15, 16, 17, 18] as const;
const MINUTES = [6, 52, 18, 41, 33, 9, 24, 47, 12, 58, 3, 29, 44, 16, 37, 51, 8, 22] as const;

export function naturalTimeForIndex(i: number): { hour: number; minute: number } {
  const hour =
    i % 2 === 0
      ? MORNING_HOURS[Math.floor(i / 2) % MORNING_HOURS.length]!
      : AFTERNOON_HOURS[Math.floor(i / 2) % AFTERNOON_HOURS.length]!;
  const minute = MINUTES[i % MINUTES.length]!;
  return { hour, minute };
}

/**
 * Given messages' current `created_at` (ascending), returns new `created_at`
 * values (same order/length) that:
 *   - preserve each message's relative day-offset from the first message
 *     (same-day exchanges stay same-day; multi-day gaps stay the same size)
 *   - land the LAST message on `todayIso` minus 1 day (never in the future,
 *     regardless of what hour "now" happens to be)
 *   - use a natural coach/player hour (see naturalTimeForIndex) instead of a
 *     flat hourly progression
 * Returns `[]` if `createdAtList` is empty.
 */
export function computeMessageSchedule(createdAtList: string[], todayIso: string, tz: string): string[] {
  if (createdAtList.length === 0) return [];
  const firstDate = createdAtList[0]!.slice(0, 10);
  const offsets = createdAtList.map((iso) => daysBetween(iso.slice(0, 10), firstDate));
  const maxOffset = Math.max(...offsets);
  const targetLastDate = addDaysIso(todayIso, -1);
  const anchorDate = addDaysIso(targetLastDate, -maxOffset);
  return offsets.map((offset, i) => {
    const date = addDaysIso(anchorDate, offset);
    const { hour, minute } = naturalTimeForIndex(i);
    return localToUtcIso(date, hour, minute, tz);
  });
}

// ---------------------------------------------------------------------------
// B. Event rescheduling (rolling day-offsets-from-now, ET-correct hours)
// ---------------------------------------------------------------------------

export type EventDef = {
  title: string;
  startOffsetDays: number;
  endOffsetDays: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

export type ScheduledEvent = {
  title: string;
  startTime: string;
  endTime: string;
  status: 'completed' | 'scheduled';
};

/**
 * Resolves each EventDef's fixed day-offset-from-now into an absolute
 * start/end timestamp relative to `todayIso`, treating every hour as a
 * `tz`-local wall-clock time (correctly converted to UTC). Offsets stay
 * negative/positive across every run, so status stays consistent too —
 * this is what makes the schedule "roll" forward with real time instead of
 * freezing at whenever the seed last ran.
 */
export function computeEventSchedule(todayIso: string, defs: EventDef[], tz: string): ScheduledEvent[] {
  return defs.map((def) => {
    const startDate = addDaysIso(todayIso, def.startOffsetDays);
    const endDate = addDaysIso(todayIso, def.endOffsetDays);
    return {
      title: def.title,
      startTime: localToUtcIso(startDate, def.startHour, def.startMinute, tz),
      endTime: localToUtcIso(endDate, def.endHour, def.endMinute, tz),
      status: def.startOffsetDays < 0 ? 'completed' : 'scheduled',
    };
  });
}

// ---------------------------------------------------------------------------
// D. Round-date freshness shift
// ---------------------------------------------------------------------------

/**
 * Returns the number of days to shift EVERY round forward so the newest
 * round lands `targetMostRecentOffsetDays` before `todayIso`, or `null` if
 * the newest round is already within `staleThresholdDays` and no shift is
 * needed. A uniform shift across all rounds preserves relative spacing.
 */
export function computeRoundDateShift(
  roundDates: string[],
  todayIso: string,
  staleThresholdDays: number,
  targetMostRecentOffsetDays: number,
): number | null {
  if (roundDates.length === 0) return null;
  const maxDate = roundDates.reduce((a, b) => (a > b ? a : b));
  const staleDays = daysBetween(todayIso, maxDate);
  if (staleDays <= staleThresholdDays) return null;
  return staleDays - targetMostRecentOffsetDays;
}
