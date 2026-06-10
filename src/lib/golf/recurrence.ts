/**
 * GolfHelm recurrence rules — shared parser/serializer/expander.
 *
 * STORAGE FORMAT (backward compatible): `golf_events.recurrence_rule` stores a
 * subset of RFC-5545 RRULE text, e.g.
 *
 *   "RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=10"
 *   "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20260815"
 *
 * Every rule string written by older builds ("RRULE:FREQ=<F>;INTERVAL=1;COUNT=<n>")
 * still parses. New capabilities layered on top, all expressed with standard
 * RRULE keys so nothing previously stored breaks:
 *
 *   - multi-weekday patterns ........ BYDAY=MO,WE,FR  → `weekdays: [1, 3, 5]`
 *   - biweekly ...................... FREQ=WEEKLY;INTERVAL=2 → `frequency: 'biweekly'`
 *   - end-by-date ................... UNTIL=YYYYMMDD → `until: 'YYYY-MM-DD'` (inclusive)
 *
 * This module is PURE (no Supabase, no server-only imports) so both server
 * actions and client UI editors can share it.
 */

import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfWeek,
} from 'date-fns';

// ============================================================================
// TYPES
// ============================================================================

/** Supported recurrence cadences. `biweekly` is stored as FREQ=WEEKLY;INTERVAL=2. */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/**
 * Parsed recurrence rule.
 *
 * - `weekdays` uses JS `Date.prototype.getDay()` numbering (0 = Sunday …
 *   6 = Saturday). Only honored for daily/weekly/biweekly frequencies; ignored
 *   for monthly.
 * - `until` is an inclusive ISO calendar date (`YYYY-MM-DD`) — an occurrence
 *   landing exactly on `until` IS generated.
 * - `count` and `until` may both be present; whichever limit hits first wins.
 * - `interval` is preserved for fidelity with exotic stored rules (e.g.
 *   FREQ=WEEKLY;INTERVAL=3). A weekly rule with interval 2 is normalized to
 *   `frequency: 'biweekly'` instead.
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** 0 = Sunday … 6 = Saturday (JS getDay numbering). */
  weekdays?: number[];
  /** Total number of occurrences (including the first). */
  count?: number;
  /** Inclusive end date, ISO `YYYY-MM-DD`. */
  until?: string;
  /** Raw RRULE INTERVAL passthrough (weekly interval 2 normalizes to 'biweekly'). */
  interval?: number;
}

/**
 * Hard cap on materialized occurrences in a single series — bounds both
 * initial generation and later extension. Keeps a series comfortably under
 * the PostgREST 1000-row response cap and stops runaway rules (e.g. daily
 * with a far-future UNTIL).
 */
export const MAX_SERIES_OCCURRENCES = 366;

/**
 * Default occurrence budget when a rule specifies neither COUNT nor UNTIL —
 * matches the historical generator's 52-occurrence / 12-month window.
 */
export const DEFAULT_SERIES_OCCURRENCES = 52;

// RFC-5545 BYDAY tokens indexed by JS getDay() number.
const WEEKDAY_TOKENS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ============================================================================
// PARSE
// ============================================================================

/**
 * Parse a stored recurrence rule string into a {@link RecurrenceRule}.
 *
 * Tolerant by design: accepts rules with or without the `RRULE:` prefix,
 * ignores unknown keys, and normalizes `FREQ=WEEKLY;INTERVAL=2` to
 * `frequency: 'biweekly'`. UNTIL accepts `YYYYMMDD`, `YYYYMMDDTHHMMSSZ`, or
 * `YYYY-MM-DD`.
 *
 * @returns the parsed rule, or `null` when the string has no usable FREQ.
 */
export function parseRecurrenceRule(rule: string | null | undefined): RecurrenceRule | null {
  if (!rule) return null;
  const body = rule.startsWith('RRULE:') ? rule.slice(6) : rule;

  let frequency: RecurrenceFrequency | null = null;
  let interval: number | undefined;
  let weekdays: number[] | undefined;
  let count: number | undefined;
  let until: string | undefined;

  for (const part of body.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    if (!value) continue;

    switch (key) {
      case 'FREQ': {
        const freq = value.toUpperCase();
        if (freq === 'DAILY') frequency = 'daily';
        else if (freq === 'WEEKLY') frequency = 'weekly';
        else if (freq === 'BIWEEKLY') frequency = 'biweekly'; // non-standard but accepted
        else if (freq === 'MONTHLY') frequency = 'monthly';
        break;
      }
      case 'INTERVAL': {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed >= 1) interval = parsed;
        break;
      }
      case 'BYDAY': {
        const days = value
          .split(',')
          .map((token) => WEEKDAY_TOKENS.indexOf(token.trim().toUpperCase() as (typeof WEEKDAY_TOKENS)[number]))
          .filter((idx) => idx >= 0);
        if (days.length > 0) weekdays = [...new Set(days)].sort((a, b) => a - b);
        break;
      }
      case 'COUNT': {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed >= 1) count = parsed;
        break;
      }
      case 'UNTIL': {
        const digits = value.replace(/[^0-9]/g, '').slice(0, 8);
        if (digits.length === 8) {
          until = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
        }
        break;
      }
    }
  }

  if (!frequency) return null;

  // Normalize weekly+interval=2 → biweekly so consumers get one canonical shape.
  if (frequency === 'weekly' && interval === 2) {
    frequency = 'biweekly';
    interval = undefined;
  }
  if (frequency === 'biweekly') interval = undefined;
  if (interval === 1) interval = undefined;

  const out: RecurrenceRule = { frequency };
  if (weekdays) out.weekdays = weekdays;
  if (count !== undefined) out.count = count;
  if (until !== undefined) out.until = until;
  if (interval !== undefined) out.interval = interval;
  return out;
}

// ============================================================================
// SERIALIZE
// ============================================================================

/**
 * Serialize a {@link RecurrenceRule} back to the stored RRULE string format.
 *
 * Round-trips with {@link parseRecurrenceRule}; `biweekly` is written as the
 * standard `FREQ=WEEKLY;INTERVAL=2` so external RRULE consumers (ICS export)
 * stay compatible.
 */
export function serializeRecurrenceRule(rule: RecurrenceRule): string {
  const freq = rule.frequency === 'biweekly' ? 'WEEKLY' : rule.frequency.toUpperCase();
  const interval = rule.frequency === 'biweekly' ? 2 : rule.interval && rule.interval >= 1 ? rule.interval : 1;

  const parts = [`FREQ=${freq}`, `INTERVAL=${interval}`];

  if (rule.weekdays && rule.weekdays.length > 0) {
    const tokens = [...new Set(rule.weekdays)]
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_TOKENS[d]);
    if (tokens.length > 0) parts.push(`BYDAY=${tokens.join(',')}`);
  }
  if (rule.count !== undefined && rule.count >= 1) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}`);

  return `RRULE:${parts.join(';')}`;
}

// ============================================================================
// DESCRIBE
// ============================================================================

/**
 * Human-readable label for a rule, for UI editors and confirmation dialogs.
 *
 * Examples:
 *   - "Weekly, 10 times"
 *   - "Every 2 weeks on Mon, Wed, Fri until Aug 15, 2026"
 *   - "Monthly"
 */
export function describeRecurrenceRule(rule: RecurrenceRule): string {
  let base: string;
  switch (rule.frequency) {
    case 'daily':
      base = rule.interval && rule.interval > 1 ? `Every ${rule.interval} days` : 'Daily';
      break;
    case 'weekly':
      base = rule.interval && rule.interval > 1 ? `Every ${rule.interval} weeks` : 'Weekly';
      break;
    case 'biweekly':
      base = 'Every 2 weeks';
      break;
    case 'monthly':
      base = rule.interval && rule.interval > 1 ? `Every ${rule.interval} months` : 'Monthly';
      break;
  }

  if (rule.weekdays && rule.weekdays.length > 0 && rule.frequency !== 'monthly') {
    const labels = [...new Set(rule.weekdays)]
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d]);
    if (labels.length > 0) base += ` on ${labels.join(', ')}`;
  }

  if (rule.until) {
    base += ` until ${format(parseISO(rule.until), 'MMM d, yyyy')}`;
  } else if (rule.count !== undefined) {
    base += rule.count === 1 ? ', once' : `, ${rule.count} times`;
  }

  return base;
}

// ============================================================================
// EXPAND
// ============================================================================

export interface GenerateOccurrencesOptions {
  /**
   * Occurrence budget when the rule has no COUNT. Defaults to
   * {@link DEFAULT_SERIES_OCCURRENCES}. Always clamped to
   * {@link MAX_SERIES_OCCURRENCES}.
   */
  maxOccurrences?: number;
}

/**
 * Expand a rule into concrete occurrence dates (ISO `YYYY-MM-DD`), starting at
 * `startDate`.
 *
 * Semantics (hand-checked by the unit suite):
 * - Without `weekdays`: the start date is occurrence #1 and subsequent dates
 *   stride by the frequency (daily/weekly/biweekly/monthly × interval).
 * - With `weekdays` (daily/weekly/biweekly only): occurrences land on each
 *   listed weekday at or after `startDate` — the start date itself is skipped
 *   when it doesn't match the pattern. Biweekly alternates whole calendar
 *   weeks anchored on the start date's week.
 * - `until` is INCLUSIVE; `count` is the total number of occurrences;
 *   whichever limit is reached first stops generation.
 * - When neither `count` nor `until` is given, generation stops after
 *   `maxOccurrences` (default 52) or 12 months, whichever comes first —
 *   matching the historical generator.
 * - Output length never exceeds {@link MAX_SERIES_OCCURRENCES}.
 */
export function generateOccurrences(
  startDate: string,
  rule: RecurrenceRule,
  options?: GenerateOccurrencesOptions,
): string[] {
  const start = parseISO(startDate);
  if (Number.isNaN(start.getTime())) return [];

  const budget = Math.min(
    rule.count ?? options?.maxOccurrences ?? DEFAULT_SERIES_OCCURRENCES,
    MAX_SERIES_OCCURRENCES,
  );
  if (budget < 1) return [];

  const untilDate = rule.until ? parseISO(rule.until) : null;
  // Historical fallback horizon when no explicit end: 12 months (exclusive).
  const defaultHorizon = addMonths(start, 12);
  const withinHorizon = (d: Date): boolean =>
    untilDate ? !isAfter(d, untilDate) : isBefore(d, defaultHorizon);

  const dates: string[] = [];
  const weekdaySet =
    rule.weekdays && rule.weekdays.length > 0 && rule.frequency !== 'monthly'
      ? new Set(rule.weekdays.filter((d) => d >= 0 && d <= 6))
      : null;

  if (weekdaySet && weekdaySet.size > 0) {
    // Day-walk with a weekday filter. Biweekly alternates whole calendar
    // weeks; weekly honors interval > 1 the same way.
    const intervalWeeks =
      rule.frequency === 'biweekly'
        ? 2
        : rule.frequency === 'weekly' && rule.interval && rule.interval > 1
          ? rule.interval
          : 1;
    const weekAnchor = startOfWeek(start, { weekStartsOn: 0 });

    let current = start;
    // Defensive bound: MAX occurrences × max stride keeps this a few
    // thousand iterations at worst.
    for (let i = 0; i < MAX_SERIES_OCCURRENCES * 7 * intervalWeeks; i += 1) {
      if (dates.length >= budget || !withinHorizon(current)) break;
      const weekIndex = Math.floor(differenceInCalendarDays(current, weekAnchor) / 7);
      if (weekdaySet.has(current.getDay()) && weekIndex % intervalWeeks === 0) {
        dates.push(format(current, 'yyyy-MM-dd'));
      }
      current = addDays(current, 1);
    }
    return dates;
  }

  // Plain stride expansion (the historical behavior, plus biweekly).
  let current = start;
  while (dates.length < budget && withinHorizon(current)) {
    dates.push(format(current, 'yyyy-MM-dd'));
    switch (rule.frequency) {
      case 'daily':
        current = addDays(current, rule.interval ?? 1);
        break;
      case 'weekly':
        current = addWeeks(current, rule.interval ?? 1);
        break;
      case 'biweekly':
        current = addWeeks(current, 2);
        break;
      case 'monthly':
        current = addMonths(current, rule.interval ?? 1);
        break;
    }
  }
  return dates;
}
