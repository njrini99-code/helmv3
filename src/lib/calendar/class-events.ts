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

/**
 * The `[class:<id>]` tag is an internal ownership marker, not prose. It was
 * rendering verbatim in the event drawer's description ("Credits: 3
 * [class:7605fd55-…]"), so strip it wherever a description is shown.
 */
export function stripClassTag(description: string | null | undefined): string | null {
  if (!description) return null;
  // Global on purpose — CLASS_TAG_PATTERN is un-flagged so it can be used for
  // capture, and a single .replace() with it would leave a second tag behind.
  const cleaned = description.replace(/\[class:[^\]\s]+\]/g, '').replace(/\n{2,}/g, '\n').trim();
  return cleaned || null;
}

// ===========================================================================
// Attribution — whose class is this?
// ===========================================================================

/** A player who owns classes, as far as the calendar needs to know. */
export interface ClassOwner {
  playerId: string;
  firstName: string | null;
  lastName: string | null;
}

/** Class id → owning player, for every class on the team the viewer can read. */
export type ClassOwnerIndex = Record<string, ClassOwner>;

/** "Braeden G." — short enough for a calendar chip, unambiguous on a roster. */
export function shortOwnerLabel(owner: ClassOwner): string {
  const first = (owner.firstName ?? '').trim();
  const lastInitial = (owner.lastName ?? '').trim().charAt(0);
  if (first && lastInitial) return `${first} ${lastInitial}.`;
  return first || (owner.lastName ?? '').trim() || 'Player';
}

/** "BG" — the month grid has room for two characters and not much else. */
export function ownerInitials(owner: ClassOwner): string {
  const a = (owner.firstName ?? '').trim().charAt(0);
  const b = (owner.lastName ?? '').trim().charAt(0);
  return (a + b).toUpperCase() || '—';
}

/** What attribution adds to a calendar event. */
export interface ClassAttribution {
  /** Owning player's id — drives the identity tint (`tintFor`). */
  owner_player_id?: string | null;
  /** "Braeden G." */
  owner_label?: string | null;
  /** "BG" */
  owner_initials?: string | null;
}

export interface ClassViewer {
  isCoach: boolean;
  /** The viewer's own `golf_players.id`, when they are a player. */
  playerId: string | null;
  /**
   * Did the owner lookup actually run? A FAILED lookup is unknown ownership,
   * not "nobody owns anything" — treating the two the same would make a
   * player's own classes vanish from their calendar on a transient DB error.
   */
  ownersResolved: boolean;
}

/**
 * Label every class occurrence with the player it belongs to, and scope who
 * may see it.
 *
 * A coach sees the whole team's classes (that is the "All" lens they asked
 * for), each carrying its owner. A player sees only their OWN — `golf_events`
 * has no row-level notion of a personal event, but `golf_player_classes` RLS is
 * unambiguous that a player may read their own classes and their coach's view
 * of them, never a teammate's. Putting names on the calendar without honoring
 * that would turn a quiet inconsistency into a published directory of every
 * teammate's whereabouts.
 *
 * Pure and idempotent — safe to run on the server payload and again over the
 * client-merged pages.
 */
export function attributeClassEvents<
  T extends { event_type: string; description?: string | null },
>(events: T[], owners: ClassOwnerIndex, viewer: ClassViewer): (T & ClassAttribution)[] {
  const out: (T & ClassAttribution)[] = [];

  for (const event of events) {
    if (!isClassEvent(event)) {
      out.push(event);
      continue;
    }

    const classId = classIdFromDescription(event.description);
    const owner = classId ? owners[classId] : undefined;

    if (!owner) {
      // Unknown owner.
      //
      // A coach still sees the event — never hide a coach's own calendar data,
      // and the conflict checker depends on it.
      //
      // A PLAYER does not. This used to fall the other way: when the owner
      // index could not be resolved, "nothing has been established either way"
      // was read as grounds to leave the rows in place, so a single failed
      // roster read flipped a player's calendar from "my classes" to every
      // teammate's, fully rendered. That is the wrong side to fail to on a
      // privacy filter — the cost of being wrong is a published timetable of
      // three students' whereabouts for a term, against the cost of a player
      // briefly not seeing class blocks they can re-load.
      //
      // `ownersResolved` is kept because it still distinguishes the two cases
      // for the CALLER (which logs the failed lookup); it just no longer
      // decides whether to show the rows.
      if (viewer.isCoach) out.push(event);
      continue;
    }

    if (!viewer.isCoach && owner.playerId !== viewer.playerId) continue;

    out.push({
      ...event,
      owner_player_id: owner.playerId,
      owner_label: shortOwnerLabel(owner),
      owner_initials: ownerInitials(owner),
    });
  }

  return out;
}
