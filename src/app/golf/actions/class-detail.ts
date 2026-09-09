'use server';

/**
 * Class occurrence detail for the calendar (design plan §2.4).
 *
 * A class meeting is synced onto the TEAM calendar as an ordinary
 * `golf_events` row (see `src/lib/calendar/class-events.ts`) so it shows up
 * in the "All" lens, but the class is a PERSONAL commitment. Anyone who can
 * read the team calendar can already see the row exists and when it runs —
 * that is `access: 'free_busy'`. Only the owning player and a coach of a
 * team where they are an ACTIVE member may see what it actually is — the
 * class name, instructor, and location — and that is `access: 'detail'`.
 *
 * The load-bearing rule, twice over in this file: identity access is
 * decided by whether `golf_player_classes` (RLS: `golf_player_classes_select_team`,
 * `golf_classes_select_coaches`) returns the row, NEVER by whether the
 * `golf_events` class row is readable. A teammate who is neither the owner
 * nor a coach can read that `golf_events` row all day — that only ever buys
 * them `free_busy`.
 */

import { createClient } from '@/lib/supabase/server';
import { classIdFromDescription } from '@/lib/calendar/class-events';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(date: string): boolean {
  if (!DATE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(y!, m! - 1, d!);
  return parsed.getFullYear() === y && parsed.getMonth() === m! - 1 && parsed.getDate() === d;
}

export interface ClassOccurrenceDetailRequest {
  /** The synced calendar event for this occurrence, when one exists. */
  eventId?: string;
  /** The class row id. Required when `eventId` is omitted (an unsynced
   * occurrence); otherwise used only as a fallback if the event's own
   * `[class:<id>]` tag cannot be read. */
  classId?: string;
  /** Calendar date (YYYY-MM-DD) of this specific meeting, used to look up
   * an academic exclusion for that date. */
  date: string;
}

/**
 * Whether an academic exclusion covers this occurrence's date.
 * `'unknown'` — never `'scheduled'` — when the exclusion table could not be
 * read: a failed read is not evidence of no exclusion (mirrors
 * `availability.ts`'s `partial` handling on the same table).
 */
export interface ClassOccurrenceStatus {
  state: 'scheduled' | 'excluded' | 'unknown';
  reason: string | null;
  startDate: string | null;
  endDate: string | null;
}

/** Full identity detail — returned only to the owner or an active coach. */
export interface ClassOccurrenceDetail {
  classId: string;
  /** Null for an unsynced occurrence (no `golf_events` row backs it yet). */
  eventId: string | null;
  date: string;
  /** ISO instants for THIS occurrence, present only when a synced event
   * backs it (`synced: true`). */
  start: string | null;
  end: string | null;
  synced: boolean;
  className: string;
  instructor: string | null;
  days: string[] | null;
  /** `HH:MM:SS` wall-clock strings from `golf_player_classes`. */
  startTime: string | null;
  endTime: string | null;
  building: string | null;
  room: string | null;
  semester: string | null;
  notes: string | null;
  status: ClassOccurrenceStatus;
}

/** Time-only view for a viewer without class detail access. No title, no
 * instructor, no location — the server never sends them to redact client-side. */
export interface ClassFreeBusyDetail {
  eventId: string;
  date: string;
  start: string;
  end: string;
}

export type ClassOccurrenceDetailResult =
  | { success: true; access: 'detail'; data: ClassOccurrenceDetail }
  | { success: true; access: 'free_busy'; data: ClassFreeBusyDetail }
  | { success: true; access: 'none' }
  | { success: false; error: string };

interface EventRow {
  id: string;
  team_id: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
}

/**
 * Resolve one class occurrence and decide, server-side, how much of it this
 * viewer may see. See the module doc for the access rule.
 */
export async function getClassOccurrenceDetail(
  request: ClassOccurrenceDetailRequest,
): Promise<ClassOccurrenceDetailResult> {
  try {
    if (!isValidCalendarDate(request.date)) {
      return { success: false, error: 'Choose a valid calendar date.' };
    }
    if (request.eventId && !UUID.test(request.eventId)) {
      return { success: false, error: 'This class could not be found.' };
    }
    if (request.classId && !UUID.test(request.classId)) {
      return { success: false, error: 'This class could not be found.' };
    }
    if (!request.eventId && !request.classId) {
      return { success: false, error: 'A class or event is required.' };
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Sign in to view this class.' };

    // Step 1: read the calendar event, ONLY for its occurrence time and to
    // find the class tag. This read never grants identity access — see the
    // module doc.
    let eventRow: EventRow | null = null;
    let resolvedClassId: string | null = request.classId ?? null;

    if (request.eventId) {
      const { data: event, error: eventError } = await supabase
        .from('golf_events')
        .select('id, team_id, start_time, end_time, description')
        .eq('id', request.eventId)
        .maybeSingle();
      if (eventError) {
        await logServerError(
          `[class-detail] event read failed: ${describeError(eventError)}`,
          { action: 'class-detail.getClassOccurrenceDetail', featureArea: 'calendar' },
        );
        return { success: false, error: 'This class could not be checked right now. Please retry.' };
      }
      if (!event) {
        // RLS-filtered (not this viewer's team) or genuinely gone. Either
        // way there is nothing left for this viewer, not even free/busy.
        return { success: true, access: 'none' };
      }
      eventRow = event;
      // When an eventId is given, the event's OWN `[class:<id>]` tag is the
      // only source of truth for which class this occurrence is — a caller-
      // supplied `classId` is never used as a fallback here. Without this,
      // passing a real (unrelated) classId alongside a non-class eventId
      // would return that class's detail stitched to this event's start/end,
      // an incoherent — and if the caller's own class, quietly wrong —
      // occurrence. `classId` is a fallback only for the no-eventId
      // (unsynced-occurrence) path below.
      resolvedClassId = classIdFromDescription(event.description);
      if (!resolvedClassId) {
        // Readable event, but not a class occurrence — this action has
        // nothing to add for it, regardless of any classId also supplied.
        return { success: true, access: 'none' };
      }
    }

    if (!resolvedClassId) {
      return { success: true, access: 'none' };
    }

    // Step 2: the ONE identity read. Row present == detail access, decided
    // entirely by golf_player_classes RLS, never by the event read above.
    const { data: classRow, error: classError } = await supabase
      .from('golf_player_classes')
      .select('id, player_id, class_name, instructor, days, start_time, end_time, building, room, semester, notes')
      .eq('id', resolvedClassId)
      .maybeSingle();
    if (classError) {
      await logServerError(
        `[class-detail] class read failed: ${describeError(classError)}`,
        { action: 'class-detail.getClassOccurrenceDetail', featureArea: 'calendar' },
      );
      return { success: false, error: 'This class could not be checked right now. Please retry.' };
    }

    if (classRow) {
      // Exclusion lookup is scoped to the SAME player and is RLS-gated the
      // same way (`Players can view their own exclusions`, `Coaches can
      // manage exclusions`), so it can never leak a reason to a viewer who
      // was not already granted detail access above.
      const { data: exclusions, error: exclusionError } = await supabase
        .from('golf_academic_exclusions')
        .select('start_date, end_date, reason')
        .eq('player_id', classRow.player_id)
        .lte('start_date', request.date)
        .gte('end_date', request.date);

      let status: ClassOccurrenceStatus;
      if (exclusionError) {
        await logServerError(
          `[class-detail] exclusion read failed; occurrence status reported as unknown: ${describeError(exclusionError)}`,
          { action: 'class-detail.getClassOccurrenceDetail', featureArea: 'calendar' },
          'warning',
        );
        status = { state: 'unknown', reason: null, startDate: null, endDate: null };
      } else {
        const hit = (exclusions ?? [])[0] ?? null;
        status = hit
          ? { state: 'excluded', reason: hit.reason ?? null, startDate: hit.start_date, endDate: hit.end_date }
          : { state: 'scheduled', reason: null, startDate: null, endDate: null };
      }

      return {
        success: true,
        access: 'detail',
        data: {
          classId: classRow.id,
          eventId: eventRow?.id ?? null,
          date: request.date,
          start: eventRow?.start_time ?? null,
          end: eventRow?.end_time ?? null,
          synced: Boolean(eventRow),
          className: classRow.class_name,
          instructor: classRow.instructor,
          days: classRow.days,
          startTime: classRow.start_time,
          endTime: classRow.end_time,
          building: classRow.building,
          room: classRow.room,
          semester: classRow.semester ?? null,
          notes: classRow.notes,
          status,
        },
      };
    }

    // No golf_player_classes row was visible to this viewer under RLS — not
    // the owner, not their active coach. The only thing left to offer is a
    // free/busy time block, and only when there is a real team-calendar row
    // to back it.
    if (!eventRow || !eventRow.start_time || !eventRow.end_time) {
      // Unsynced occurrence (or a bare classId lookup) with no detail
      // access: no team-calendar row backs it, so this viewer gets nothing.
      return { success: true, access: 'none' };
    }

    // Confirmed explicitly, not merely inferred from "the event read above
    // returned a row": that read is exercised against a test double that
    // does not itself enforce RLS, so the free/busy grant must stand on its
    // own team-membership check.
    const [coachAccess, playerAccess] = await Promise.all([
      supabase.rpc('is_golf_team_coach', { team_uuid: eventRow.team_id }),
      supabase.rpc('is_golf_team_player', { team_uuid: eventRow.team_id }),
    ]);
    if (coachAccess.error || playerAccess.error || (!coachAccess.data && !playerAccess.data)) {
      return { success: true, access: 'none' };
    }

    return {
      success: true,
      access: 'free_busy',
      data: {
        eventId: eventRow.id,
        date: request.date,
        start: eventRow.start_time,
        end: eventRow.end_time,
      },
    };
  } catch (err) {
    await logServerError(
      `[class-detail] getClassOccurrenceDetail failed: ${describeError(err)}`,
      { action: 'class-detail.getClassOccurrenceDetail', featureArea: 'calendar' },
    );
    return { success: false, error: 'This class could not be loaded. Please retry.' };
  }
}
