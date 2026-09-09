'use server';

/**
 * Conflict inbox for the calendar (design plan §2.8).
 *
 * Turns overlaps between an event and its attendees' own schedules into a
 * list a coach (team scope) or a player (own-events scope) can act on.
 * Reuses `checkEventConflicts` (src/lib/calendar/conflicts.ts) per event —
 * it already knows how to read an attendee's busy periods and report a
 * partial result honestly when a read fails.
 *
 * Two honesty rules this file owns on top of that:
 *
 * 1. Per-person verification is DERIVED, never invented. `checkEventConflicts`
 *    returns one `partial` flag for the whole check, not per attendee. An
 *    attendee who appears in `conflicts` was provably read (`complete`).
 *    When the event-level check was clean (`partial: false`), every invited
 *    attendee was read, so all are `complete`. Only when `partial: true` are
 *    the non-overlapping attendees `unknown` — never "clear", because a
 *    failed read is not evidence of no conflict.
 *
 * 2. A class occurrence's title is included only when THIS viewer has class
 *    detail access to it (§2.4's rule, re-applied here) — decided the same
 *    way: a `golf_player_classes` read for the occurrence's class id, RLS
 *    only. `checkEventConflicts` fabricates `'Busy'` for a missing title
 *    (conflicts.ts:149); that fallback is never forwarded for a class
 *    overlap — an inaccessible class overlap gets no `title` field at all.
 */

import { createClient } from '@/lib/supabase/server';
import { checkEventConflicts } from '@/lib/calendar/conflicts';
import { classIdFromDescription, isClassEvent } from '@/lib/calendar/class-events';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Hard bounds from §2.8: never scan more than two weeks or 50 events. */
const MAX_WINDOW_DAYS = 14;
const MAX_EVENTS = 50;

function isValidCalendarDate(date: string): boolean {
  if (!DATE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(y!, m! - 1, d!);
  return parsed.getFullYear() === y && parsed.getMonth() === m! - 1 && parsed.getDate() === d;
}

export interface ConflictInboxRequest {
  teamId: string;
  /** Inclusive, `YYYY-MM-DD`. */
  from: string;
  /** Exclusive, `YYYY-MM-DD`. Clamped to at most 14 days after `from`. */
  to: string;
}

export interface ConflictOverlapEvent {
  id?: string;
  /** Omitted — never a fabricated placeholder — when this is a class
   * occurrence the viewer lacks detail access to (see module doc, rule 2). */
  title?: string;
  start: string;
  end: string;
  type: 'event' | 'class' | 'blocked';
  /** Present only when `title` was withheld. */
  access?: 'free_busy';
}

export interface ConflictOverlap {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  conflictingEvent: ConflictOverlapEvent;
}

export interface ConflictGroup {
  event: { id: string; title: string; start: string; end: string; type: string | null };
  /** One row per attendee whose OWN schedule overlaps this event. */
  overlaps: ConflictOverlap[];
  /** Invited attendees whose schedule could not be checked this pass.
   * Populated only when `verification === 'partial'` — never treated as
   * clear. */
  unverifiedAttendeeIds: string[];
  verification: 'complete' | 'partial';
}

export interface ConflictInboxSnapshot {
  teamId: string;
  window: { start: string; end: string };
  checkedAt: string;
  groups: ConflictGroup[];
}

export type ConflictInboxResult =
  | { success: true; data: ConflictInboxSnapshot }
  | { success: false; error: string };

interface EventRow {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  event_type: string | null;
  description: string | null;
  status: string | null;
}

export async function getConflictInbox(request: ConflictInboxRequest): Promise<ConflictInboxResult> {
  try {
    if (!UUID.test(request.teamId) || !isValidCalendarDate(request.from) || !isValidCalendarDate(request.to)) {
      return { success: false, error: 'Choose a valid team and date range.' };
    }
    const fromDate = new Date(`${request.from}T00:00:00.000Z`);
    const requestedTo = new Date(`${request.to}T00:00:00.000Z`);
    if (requestedTo <= fromDate) {
      return { success: false, error: 'Choose a valid date range.' };
    }
    const maxTo = new Date(fromDate);
    maxTo.setUTCDate(maxTo.getUTCDate() + MAX_WINDOW_DAYS);
    // Bound the window server-side rather than trusting the caller — never
    // silently widen, only ever narrow.
    const toDate = requestedTo > maxTo ? maxTo : requestedTo;
    const startIso = fromDate.toISOString();
    const endIso = toDate.toISOString();

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Sign in to view conflicts.' };

    const [coachAccess, playerAccess] = await Promise.all([
      supabase.rpc('is_golf_team_coach', { team_uuid: request.teamId }),
      supabase.rpc('is_golf_team_player', { team_uuid: request.teamId }),
    ]);
    if (coachAccess.error || playerAccess.error || (!coachAccess.data && !playerAccess.data)) {
      return { success: false, error: 'You do not have access to this team schedule.' };
    }

    let events: EventRow[] = [];
    /** Player-scope attendee lists are always just the caller — see below. */
    let selfPlayerId: string | null = null;

    if (coachAccess.data) {
      // Coach scope: every one of the team's own events in the window.
      // `.neq('event_type', 'class')` is the invariant class-events.ts states
      // for any query that means "the team's schedule": a class occurrence is
      // a PERSONAL commitment synced onto the team calendar, never the base
      // event a conflict check is run against (it can still appear as an
      // OVERLAP, via checkEventConflicts reading the owner's own busy time).
      const { data, error } = await supabase
        .from('golf_events')
        .select('id, title, start_time, end_time, event_type, description, status')
        .eq('team_id', request.teamId)
        .neq('status', 'cancelled')
        .neq('event_type', 'class')
        .gte('start_time', startIso)
        .lt('start_time', endIso);
      if (error) {
        await logServerError(
          `[conflict-inbox] event read failed: ${describeError(error)}`,
          { action: 'conflict-inbox.getConflictInbox', featureArea: 'calendar' },
        );
        return { success: false, error: 'Conflicts could not be loaded. Please retry.' };
      }
      events = data ?? [];
    } else {
      // Player scope: only events THIS player is invited to — resolved via
      // their own attendance rows, not a team-wide sweep.
      const { data: player, error: playerError } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (playerError || !player) {
        return { success: false, error: 'Your player profile could not be verified.' };
      }
      selfPlayerId = player.id;

      // Two plain queries rather than an embedded-resource select: which
      // events is this player invited to, then which of those are real,
      // in-window, non-cancelled team events. Keeps this scope's
      // authorization as legible (and as testable) as the coach scope's.
      // Paginated (fetchAllRowsResult), not a single unbounded select: a
      // silent PostgREST 1000-row truncation here would drop this player's
      // older events from `ownEventIds`, and a dropped event reads as "no
      // conflict" — exactly the false all-clear §2.8 forbids.
      const { data: ownAttendance, error: ownAttendanceError } = await fetchAllRowsResult<{ event_id: string }>(
        (from, to) => supabase
          .from('golf_event_attendance')
          .select('event_id')
          .eq('player_id', player.id)
          .order('id', { ascending: true })
          .range(from, to),
        undefined,
        { table: 'golf_event_attendance', action: 'getConflictInbox', feature: 'calendar_events', sport: 'golf' },
      );
      if (ownAttendanceError) {
        await logServerError(
          `[conflict-inbox] own-attendance read failed: ${describeError(ownAttendanceError)}`,
          { action: 'conflict-inbox.getConflictInbox', featureArea: 'calendar' },
        );
        return { success: false, error: 'Conflicts could not be loaded. Please retry.' };
      }
      const ownEventIds = [...new Set((ownAttendance ?? []).map((row) => row.event_id as string))];
      if (ownEventIds.length === 0) {
        return {
          success: true,
          data: { teamId: request.teamId, window: { start: startIso, end: endIso }, checkedAt: new Date().toISOString(), groups: [] },
        };
      }

      // Same invariant as the coach-scope query above: a class occurrence is
      // never the base event a conflict check is run against — a class row
      // reaching here as `event` would leak its real title unredacted,
      // bypassing the class-detail access gate that (correctly) only ever
      // applies to `overlaps`. A player can otherwise self-RSVP to a
      // classmate's class via `respondToEvent` and land that class's event
      // id in `ownEventIds` above with no golf_player_classes access at all.
      const { data, error } = await supabase
        .from('golf_events')
        .select('id, title, start_time, end_time, event_type, description, status, team_id')
        .in('id', ownEventIds)
        .eq('team_id', request.teamId)
        .neq('status', 'cancelled')
        .neq('event_type', 'class')
        .gte('start_time', startIso)
        .lt('start_time', endIso);
      if (error) {
        await logServerError(
          `[conflict-inbox] own-event read failed: ${describeError(error)}`,
          { action: 'conflict-inbox.getConflictInbox', featureArea: 'calendar' },
        );
        return { success: false, error: 'Conflicts could not be loaded. Please retry.' };
      }
      events = data ?? [];
    }

    // Bound to 50 events, most recent first within the window — applied
    // client-side so both scopes above (a flat query and a joined one) share
    // one bound instead of duplicating `.order()`/`.limit()` chains that
    // behave slightly differently through a PostgREST embed.
    events = events
      .filter((event) => event.start_time && event.end_time)
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
      .slice(0, MAX_EVENTS);

    if (events.length === 0) {
      return {
        success: true,
        data: { teamId: request.teamId, window: { start: startIso, end: endIso }, checkedAt: new Date().toISOString(), groups: [] },
      };
    }

    const eventIds = events.map((event) => event.id);
    const attendeesByEvent = new Map<string, string[]>();

    if (coachAccess.data) {
      // One batched attendee query for every event in the window — never
      // one query per event.
      const { data: attendanceRows, error: attendanceError } = await fetchAllRowsResult<{ event_id: string; player_id: string }>(
        (from, to) => supabase
          .from('golf_event_attendance')
          .select('event_id, player_id')
          .in('event_id', eventIds)
          .order('id', { ascending: true })
          .range(from, to),
        undefined,
        { table: 'golf_event_attendance', action: 'getConflictInbox', feature: 'calendar_events', sport: 'golf' },
      );
      if (attendanceError) {
        await logServerError(
          `[conflict-inbox] attendee read failed: ${describeError(attendanceError)}`,
          { action: 'conflict-inbox.getConflictInbox', featureArea: 'calendar' },
        );
        return { success: false, error: 'Conflicts could not be loaded. Please retry.' };
      }
      for (const row of attendanceRows ?? []) {
        const list = attendeesByEvent.get(row.event_id) ?? [];
        list.push(row.player_id);
        attendeesByEvent.set(row.event_id, list);
      }
    } else if (selfPlayerId) {
      // A player's own conflict check is always against their OWN schedule —
      // never the rest of an event's roster, which they have no standing to
      // see here.
      for (const event of events) attendeesByEvent.set(event.id, [selfPlayerId]);
    }

    const computations: Array<{ event: EventRow; result: Awaited<ReturnType<typeof checkEventConflicts>> }> = [];
    for (const event of events) {
      const attendeeIds = attendeesByEvent.get(event.id) ?? [];
      if (attendeeIds.length === 0) continue;
      const result = await checkEventConflicts(
        new Date(event.start_time as string),
        new Date(event.end_time as string),
        attendeeIds,
        supabase,
        { excludeEventId: event.id, maxSuggestions: 0 },
      );
      if (!result.hasConflict && !result.partial) continue;
      computations.push({ event, result });
    }

    // Resolve which overlaps are class occurrences from the golf_events rows
    // themselves — every overlap with an id, not only the ones upstream
    // tagged 'class'. The tag from checkEventConflicts is derived by
    // availability.ts and is now filtered there too, but this gate must not
    // depend on that: a mislabeled class overlap would carry its real title
    // straight past it. One batched read across every group.
    const overlapEventIds = new Set<string>();
    for (const { result } of computations) {
      for (const conflict of result.conflicts) {
        if (conflict.conflictingEvent.id) overlapEventIds.add(conflict.conflictingEvent.id);
      }
    }
    /** `null` classId means "a class occurrence whose tag did not resolve":
     * still a class, never detail-accessible. */
    const classByEventId = new Map<string, { classId: string | null }>();
    let classResolutionFailed = false;
    if (overlapEventIds.size > 0) {
      const { data: overlapRows, error: overlapRowsError } = await supabase
        .from('golf_events')
        .select('id, event_type, description')
        .in('id', Array.from(overlapEventIds));
      if (overlapRowsError) {
        // Fail closed: with no rows to resolve against, every overlap that
        // upstream tagged 'class' stays free/busy (below), and nothing that
        // was NOT tagged can be promoted to detail either way.
        classResolutionFailed = true;
        await logServerError(
          `[conflict-inbox] overlap-row read failed; class overlaps stay free/busy: ${describeError(overlapRowsError)}`,
          { action: 'conflict-inbox.getConflictInbox', featureArea: 'calendar' },
          'warning',
        );
      } else {
        for (const row of overlapRows ?? []) {
          if (isClassEvent(row)) classByEventId.set(row.id, { classId: classIdFromDescription(row.description) });
        }
      }
    }
    const classIdByEventId = new Map<string, string>();
    for (const [eventId, { classId }] of classByEventId) {
      if (classId) classIdByEventId.set(eventId, classId);
    }
    const accessibleClassIds = new Set<string>();
    const distinctClassIds = Array.from(new Set(classIdByEventId.values()));
    if (distinctClassIds.length > 0) {
      const { data: accessibleRows, error: accessError } = await supabase
        .from('golf_player_classes')
        .select('id')
        .in('id', distinctClassIds);
      if (accessError) {
        await logServerError(
          `[conflict-inbox] class-access read failed; affected class overlaps stay free/busy: ${describeError(accessError)}`,
          { action: 'conflict-inbox.getConflictInbox', featureArea: 'calendar' },
          'warning',
        );
      } else {
        for (const row of accessibleRows ?? []) accessibleClassIds.add(row.id);
      }
    }

    const groups: ConflictGroup[] = computations.map(({ event, result }) => {
      const attendeeIds = attendeesByEvent.get(event.id) ?? [];
      const conflictedPlayerIds = new Set(
        result.conflicts.map((conflict) => conflict.playerId).filter((id): id is string => Boolean(id)),
      );
      // Rule 1 from the module doc: derived, not invented.
      const unverifiedAttendeeIds = result.partial
        ? attendeeIds.filter((id) => !conflictedPlayerIds.has(id))
        : [];

      const overlaps: ConflictOverlap[] = result.conflicts.map((conflict) => {
        const overlapId = conflict.conflictingEvent.id;
        // Class-ness comes from the row read above. The upstream tag only
        // ever ADDS to that (an id-less or unread overlap tagged 'class' is
        // still treated as one) — it can never clear it.
        const isClass = conflict.conflictingEvent.type === 'class'
          || Boolean(overlapId && classByEventId.has(overlapId))
          || (classResolutionFailed && Boolean(overlapId));
        const classId = overlapId ? classIdByEventId.get(overlapId) : undefined;
        const hasDetailAccess = !isClass || (Boolean(classId) && accessibleClassIds.has(classId as string));
        const overlapEvent: ConflictOverlapEvent = {
          id: conflict.conflictingEvent.id,
          start: conflict.conflictingEvent.start.toISOString(),
          end: conflict.conflictingEvent.end.toISOString(),
          type: conflict.conflictingEvent.type,
          ...(hasDetailAccess ? { title: conflict.conflictingEvent.title } : { access: 'free_busy' as const }),
        };
        return {
          playerId: conflict.playerId ?? '',
          name: conflict.userName,
          avatarUrl: conflict.avatarUrl ?? null,
          conflictingEvent: overlapEvent,
        };
      });

      return {
        event: {
          id: event.id,
          title: event.title ?? '',
          start: event.start_time as string,
          end: event.end_time as string,
          type: event.event_type,
        },
        overlaps,
        unverifiedAttendeeIds,
        verification: result.partial ? 'partial' : 'complete',
      };
    });

    return {
      success: true,
      data: { teamId: request.teamId, window: { start: startIso, end: endIso }, checkedAt: new Date().toISOString(), groups },
    };
  } catch (err) {
    await logServerError(
      `[conflict-inbox] getConflictInbox failed: ${describeError(err)}`,
      { action: 'conflict-inbox.getConflictInbox', featureArea: 'calendar' },
    );
    return { success: false, error: 'Conflicts could not be loaded. Your selection has been kept.' };
  }
}
