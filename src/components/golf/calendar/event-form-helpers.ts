/**
 * Pure helpers shared by the two coach event editors:
 *   - EventDetailModal   (legacy golf calendar UI)
 *   - FairwayEventEditor (Fairway re-skin)
 *
 * Extracted so the attendee add/remove computation (audit finding #4 — the
 * P1 attendee wipe), the recurrence-rule form mapping (#22), and the
 * datetime-local conversions (#15) are unit-testable without mounting the
 * modals. No React, no Supabase, no side effects.
 */

import type { RecurrenceRule } from '@/lib/golf/recurrence';

// ============================================================================
// ATTENDEE DIFFING
// ============================================================================

export interface AttendeeChanges {
  /** Selected now but not in the event's existing golf_event_attendance rows. */
  addAttendeeIds: string[];
  /** In the existing attendance rows but explicitly deselected in the form. */
  removeAttendeeIds: string[];
}

/**
 * Compute the explicit attendee delta between the event's existing
 * attendance rows and the form's current selection.
 *
 * updateGolfEvent treats the legacy `attendeeIds` field as ADDITIVE-ONLY;
 * removals are only ever applied when sent through `removeAttendeeIds`, so a
 * removal can never happen from incomplete client state — only from a
 * deliberate deselect against a hydrated baseline.
 */
export function computeAttendeeChanges(
  existingIds: readonly string[],
  selectedIds: readonly string[],
): AttendeeChanges {
  const existing = new Set(existingIds);
  const selected = new Set(selectedIds);
  return {
    addAttendeeIds: [...selected].filter((id) => !existing.has(id)),
    removeAttendeeIds: [...existing].filter((id) => !selected.has(id)),
  };
}

/**
 * Human summary of pending attendee changes for the save affordance,
 * e.g. "2 players added · 1 player removed". Returns null when there is
 * nothing to report.
 */
export function summarizeAttendeeChanges(changes: AttendeeChanges): string | null {
  const adds = changes.addAttendeeIds.length;
  const removes = changes.removeAttendeeIds.length;
  if (adds === 0 && removes === 0) return null;
  const parts: string[] = [];
  if (adds > 0) parts.push(`${adds} player${adds === 1 ? '' : 's'} added`);
  if (removes > 0) parts.push(`${removes} player${removes === 1 ? '' : 's'} removed`);
  return parts.join(' · ');
}

// ============================================================================
// DATETIME-LOCAL CONVERSION
// ============================================================================

/**
 * Convert an ISO/timestamptz string into the `YYYY-MM-DDTHH:mm` LOCAL
 * wall-clock value a `<input type="datetime-local">` expects.
 *
 * The previous prefill used `new Date(iso).toISOString().slice(0, 16)`,
 * which renders UTC wall-time in a local-time input — an ET coach saw their
 * 6 PM deadline as 10/11 PM (audit finding #15's display half).
 */
export function toDateTimeLocalValue(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============================================================================
// RECURRENCE FORM MAPPING
// ============================================================================

/** Weekday numbering matches JS Date#getDay(): 0 = Sunday … 6 = Saturday. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; short: string; long: string }> = [
  { value: 0, short: 'S', long: 'Sunday' },
  { value: 1, short: 'M', long: 'Monday' },
  { value: 2, short: 'T', long: 'Tuesday' },
  { value: 3, short: 'W', long: 'Wednesday' },
  { value: 4, short: 'T', long: 'Thursday' },
  { value: 5, short: 'F', long: 'Friday' },
  { value: 6, short: 'S', long: 'Saturday' },
];

export type RecurrenceFormFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type RecurrenceEndMode = 'count' | 'until';

export interface RecurrenceFormFields {
  recurrence: RecurrenceFormFrequency;
  recurrenceCount: number;
  /** Weekdays (0 = Sun … 6 = Sat) for weekly/biweekly patterns. */
  recurrenceWeekdays?: number[];
  /** How the series ends: after a fixed count (default) or by a date. */
  recurrenceEndMode?: RecurrenceEndMode;
  /** End-by date (YYYY-MM-DD) when recurrenceEndMode === 'until'. */
  recurrenceUntil?: string | null;
}

export const MIN_RECURRENCE_COUNT = 2;
export const MAX_RECURRENCE_COUNT = 52;

/** Local-safe weekday for a YYYY-MM-DD string (avoids the UTC-midnight shift). */
export function weekdayOfDateString(yyyyMmDd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyyMmDd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

/**
 * Build the structured RecurrenceRule the calendar contract expects
 * (serialized server-side via serializeRecurrenceRule) from the editor's
 * form fields. Returns null when the event doesn't repeat.
 *
 * - weekly/biweekly with no weekday picked falls back to the start date's
 *   weekday, so "Weekly" alone still means "every <start weekday>".
 * - 'until' end mode wins only when a date is actually set; otherwise the
 *   count is used (clamped to 2–52, matching the old inputs).
 */
export function buildRecurrenceRule(
  fields: RecurrenceFormFields,
  startDate: string,
): RecurrenceRule | null {
  if (fields.recurrence === 'none') return null;

  const rule: RecurrenceRule = { frequency: fields.recurrence };

  if (fields.recurrence === 'weekly' || fields.recurrence === 'biweekly') {
    const picked = [...new Set(fields.recurrenceWeekdays ?? [])]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    if (picked.length > 0) {
      rule.weekdays = picked;
    } else {
      const fallback = weekdayOfDateString(startDate);
      if (fallback !== null) rule.weekdays = [fallback];
    }
  }

  if (fields.recurrenceEndMode === 'until' && fields.recurrenceUntil) {
    rule.until = fields.recurrenceUntil;
  } else {
    rule.count = Math.max(
      MIN_RECURRENCE_COUNT,
      Math.min(MAX_RECURRENCE_COUNT, Math.round(fields.recurrenceCount) || MIN_RECURRENCE_COUNT),
    );
  }

  return rule;
}

/**
 * Inverse of buildRecurrenceRule — map a parsed RecurrenceRule back onto the
 * editor's form fields (prefilling a series-root edit so the pattern can be
 * extended or re-shaped).
 */
export function recurrenceFieldsFromRule(rule: RecurrenceRule | null): RecurrenceFormFields {
  if (!rule) {
    return {
      recurrence: 'none',
      recurrenceCount: 10,
      recurrenceWeekdays: [],
      recurrenceEndMode: 'count',
      recurrenceUntil: null,
    };
  }
  return {
    recurrence: rule.frequency,
    recurrenceCount: rule.count ?? 10,
    recurrenceWeekdays: rule.weekdays ? [...rule.weekdays].sort((a, b) => a - b) : [],
    recurrenceEndMode: rule.until ? 'until' : 'count',
    recurrenceUntil: rule.until ?? null,
  };
}
