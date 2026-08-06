/**
 * ============================================================================
 * Class occurrences on the golf team calendar
 * ----------------------------------------------------------------------------
 * A player's class meetings are synced onto the TEAM calendar (one golf_events
 * row per meeting) so they show up on the calendar's "All" lens — that is
 * deliberate and coaches rely on it. But a class is a PERSONAL commitment, not
 * a team event, and golf_events has no per-member column. Two markers carry
 * that distinction; both are written by syncClassToCalendar:
 *
 *   event_type = 'class'      → "this is not a team event" (filterable in SQL)
 *   description [class:<id>]  → "…and it belongs to THIS class/player"
 *
 * Any query that means "the team's schedule" must exclude CLASS_EVENT_TYPE, and
 * any code that means "this person's schedule" must additionally resolve the tag
 * to its owner. Skipping either step leaks one player's classes to the whole
 * roster — which is exactly what shipped before 2026-08-05.
 * ========================================================================== */

/** `golf_events.event_type` value marking a synced class meeting. */
export const CLASS_EVENT_TYPE = 'class';

/**
 * The ONLY link from a calendar row back to the class (and so the player) it
 * belongs to. Reader and writer share this builder so the formats cannot drift.
 */
export function classTag(classId: string): string {
  return `[class:${classId}]`;
}

const CLASS_TAG_PATTERN = /\[class:([^\]\s]+)\]/;

/** The class id a synced class occurrence belongs to, or null for a team event. */
export function classIdFromDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  return description.match(CLASS_TAG_PATTERN)?.[1] ?? null;
}

/**
 * Is this row a synced class meeting? Checks BOTH markers: `event_type` alone
 * would miss rows written before the 2026-08-05 backfill if any escaped it, and
 * the tag alone can't be filtered server-side without a LIKE scan.
 */
export function isClassEvent(event: {
  event_type?: string | null;
  description?: string | null;
}): boolean {
  return event.event_type === CLASS_EVENT_TYPE || classIdFromDescription(event.description) !== null;
}
