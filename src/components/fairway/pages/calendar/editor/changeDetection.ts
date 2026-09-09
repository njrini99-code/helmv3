/**
 * Pure changed-field diff for the review receipt (§2.2) and the "Move
 * event" primary-button label (§7: the label becomes "Move event" only
 * when every changed field is a time field).
 *
 * Kept framework-free and side-effect-free so it's trivial to unit test and
 * safe to call on every render.
 */

import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { formatClock, formatDateLabel } from '@/components/fairway/pages/calendar/EventWhenFields';

export interface ChangedFieldEntry {
  key: string;
  label: string;
  before: string;
  after: string;
}

/** Fields the diff tracks. Deliberately excludes `attendeeIds` (its own
 *  "N added · M removed" summary already exists and reads better than a
 *  raw list) and the derived `recurrenceRule` / `addAttendeeIds` /
 *  `removeAttendeeIds` (assembled at submit time, never user-facing state). */
const TRACKED_KEYS: ReadonlyArray<keyof GolfEventFormData> = [
  'title',
  'eventType',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'allDay',
  'location',
  'description',
  'requiresRsvp',
  'rsvpDeadline',
  'maxAttendees',
  'recurrence',
  'recurrenceCount',
  'recurrenceWeekdays',
  'recurrenceEndMode',
  'recurrenceUntil',
];

/** The subset of `TRACKED_KEYS` that make an edit a reschedule rather than a
 *  content change — §7's "Move event" rule. */
export const TIME_FIELD_KEYS: ReadonlySet<string> = new Set([
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'allDay',
]);

const FIELD_LABELS: Partial<Record<keyof GolfEventFormData, string>> = {
  title: 'Title',
  eventType: 'Type',
  startDate: 'Start date',
  endDate: 'End date',
  startTime: 'Start time',
  endTime: 'End time',
  allDay: 'All day',
  location: 'Location',
  description: 'Notes',
  requiresRsvp: 'RSVP',
  rsvpDeadline: 'RSVP deadline',
  maxAttendees: 'Max attendees',
  recurrence: 'Repeat',
  recurrenceCount: 'Occurrences',
  recurrenceWeekdays: 'Repeat days',
  recurrenceEndMode: 'Series ends',
  recurrenceUntil: 'Repeat until',
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const arrA = Array.isArray(a) ? [...a].sort() : [];
    const arrB = Array.isArray(b) ? [...b].sort() : [];
    return arrA.length === arrB.length && arrA.every((v, i) => v === arrB[i]);
  }
  // Treat '' and null/undefined as the same "empty" value — the form uses
  // both at different times for an unset optional field.
  const normalize = (v: unknown) => (v === '' || v === undefined ? null : v);
  return normalize(a) === normalize(b);
}

function formatFieldValue(key: keyof GolfEventFormData, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (key === 'allDay' || key === 'requiresRsvp') return value ? 'Yes' : 'No';
  if (key === 'startDate' || key === 'endDate' || key === 'recurrenceUntil') {
    return formatDateLabel(String(value));
  }
  if (key === 'startTime' || key === 'endTime') return formatClock(String(value));
  if (key === 'recurrenceWeekdays' && Array.isArray(value)) {
    return value.length ? value.map((d) => WEEKDAY_NAMES[d] ?? d).join(', ') : 'Not set';
  }
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not set';
  return String(value);
}

/** Keys whose value differs between `pristine` and `current`. Empty when
 *  there is no pristine snapshot yet (still loading, or create mode with
 *  nothing to diff against). */
export function getChangedFieldKeys(
  pristine: GolfEventFormData | null,
  current: GolfEventFormData,
): Array<keyof GolfEventFormData> {
  if (!pristine) return [];
  return TRACKED_KEYS.filter((key) => !valuesEqual(pristine[key], current[key]));
}

/** Human-readable before/after rows for every changed field, for
 *  `EventChangeSummary`. */
export function buildChangeSummary(
  pristine: GolfEventFormData | null,
  current: GolfEventFormData,
): ChangedFieldEntry[] {
  return getChangedFieldKeys(pristine, current).map((key) => ({
    key,
    label: FIELD_LABELS[key] ?? String(key),
    before: formatFieldValue(key, pristine ? pristine[key] : undefined),
    after: formatFieldValue(key, current[key]),
  }));
}

/** §7: "Move event" replaces "Save changes" only when every changed field
 *  is a time field and at least one changed. */
export function isMoveOnlyChange(pristine: GolfEventFormData | null, current: GolfEventFormData): boolean {
  const changed = getChangedFieldKeys(pristine, current);
  return changed.length > 0 && changed.every((key) => TIME_FIELD_KEYS.has(key as string));
}
