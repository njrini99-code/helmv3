'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendar — the flag-on Calendar SHELL orchestrator
 * ----------------------------------------------------------------------------
 * The single re-skinned Calendar surface for /golf/dashboard/calendar behind the
 * isRedesignEnabled() fork. The SHELL owns ALL calendar chrome (one hero, one
 * Segmented view toggle, one member rail, one "New event" affordance) and the
 * body is now fully-native Fairway in every view + role. It REUSES the existing
 * SERVER ACTIONS unchanged — it does NOT rebuild the data layer.
 *
 * ── WHAT IS REUSED UNCHANGED (cite) ─────────────────────────────────────────
 *   • Create/edit/delete/restore call the EXISTING golf event server actions
 *     (createGolfEvent / updateGolfEvent / deleteGolfEvent + the recurring-event
 *     actions) verbatim — only the form chrome is native (FairwayEventEditor).
 *   • The player RSVP write path is the EXISTING `respondToEvent` server action
 *     (→ updateRSVP into golf_event_attendance); the coach attendance summary is
 *     the EXISTING `getEventRSVP` (→ getEventRSVPStats). We lazy-import both,
 *     exactly as the legacy editorial drawer did. NO new writes.
 *   • CalendarFeedManager (ICS feeds) is reused unchanged inside a Fairway Sheet.
 *
 * ── WHAT WE RE-SKIN (our SHELL pass) ────────────────────────────────────────
 *   the hero plinth, the day-strip, the Agenda body, the native Month grid, the
 *   segmented view toggle, the member rail, and the event-detail drawer chrome —
 *   all in Fairway tokens. The legacy PremiumCalendarClient grid (which brought
 *   its OWN CalendarHeader/avatar sidebar/FAB and so duplicated the shell chrome
 *   for coaches) is RETIRED on this route (audit P232).
 *
 * ── ROLE BRANCH (isCoach, resolved server-side) ─────────────────────────────
 *   coach  → "New event" primary (→ FairwayEventEditor) + attendance Readouts;
 *            tap an event → Fairway drawer → Edit (→ FairwayEventEditor).
 *   player → "Respond" primary on the most-imminent un-RSVP'd event + 3-button
 *            RSVP control; read-only events, no FAB.
 *
 * ── HONEST-EMPTY (the all-past demo) ─────────────────────────────────────────
 *   21 events ALL PAST → upcomingCount === 0. We DEFAULT TO AGENDA so the real
 *   Feb–Apr events are visible immediately (the current week is empty); the hero
 *   shows the dim "No upcoming events" line (no fabricated count); 0 declined /
 *   tentative render as 0 in the coach Readouts.
 *
 * ── HYDRATION (serverNow → nowRef) ───────────────────────────────────────────
 *   We seed BOTH the server and first-client render from `serverNow` so the
 *   hero title, day-strip, and "today" markup match byte-for-byte (avoids React
 *   #418). After mount an effect promotes `nowRef` to the client's real
 *   `new Date()` and nudges `focusDate` forward only if the user is still parked
 *   on the server-seeded day. This mirrors the legacy EditorialCalendarSurface
 *   pattern verbatim.
 * ========================================================================== */

import * as React from 'react';
import dynamic from 'next/dynamic';
import {
  format,
  startOfWeek as startOfWeekFn,
  endOfWeek as endOfWeekFn,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  isSameDay,
} from 'date-fns';
import { CalendarPlus, RefreshCw } from 'lucide-react';
import { Segmented, Sheet, Button as FwButton, Skeleton, fairwayToast } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { TeamMember } from '@/components/golf/calendar/PremiumCalendarClient';
import type { RSVPStatus, RsvpRespondResult } from '@/hooks/useRSVP';
import { readRsvpLockCode } from '@/hooks/useRSVP';
import { zonedMidnight, eventCalendarDay } from '@/lib/calendar/timezone';
import { useCalendarRangeEvents } from '@/hooks/golf/use-calendar-range-events';
import { useRouter } from 'next/navigation';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { PLAYER_COLORS } from '@/components/golf/calendar/CalendarAvatarSidebar';
import type { CalendarFeed } from '@/components/golf/calendar/FeedCard';
import type { FeedType } from '@/components/golf/calendar/CalendarFeedManager';
import type { GolfEventFormData, RecurringEditScope } from '@/components/golf/calendar/EventDetailModal';
import { FairwayCalendarHero } from './FairwayCalendarHero';
import { FairwayAgendaView } from './FairwayAgendaView';
import { FairwayMonthGrid, type ScheduleOverlay } from './FairwayMonthGrid';
import { FairwayCalendarMemberRail } from './FairwayCalendarMemberRail';
import { FairwayAvailabilityList } from './FairwayAvailabilityList';
import { FairwayEventDetailDrawer } from './FairwayEventDetailDrawer';
import { FairwayEventEditor } from './FairwayEventEditor';

// Code-split: the ICS feed manager (legacy component, reused UNCHANGED) only
// loads when the Subscribe sheet is opened.
const CalendarFeedManager = dynamic(
  () =>
    import('@/components/golf/calendar/CalendarFeedManager').then((m) => m.CalendarFeedManager),
);

async function loadCalendarFeedActions() {
  return import('@/app/golf/actions/calendar-feeds');
}

type ViewId = 'day' | 'week' | 'month' | 'agenda';

export interface FairwayCalendarProps {
  events: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach: boolean;
  teamTimezone: string | null;
  /** Count of events at/after serverNow (page-derived, stable). */
  upcomingCount: number;
  /** ISO timestamp captured on the server — seeds the deferred `nowRef`. */
  serverNow: string;
  /** Current coach/player id — excluded from the attendee picker. */
  currentUserId?: string;
  /** Team id — enables range-driven refetch + the stable realtime channel. */
  teamId?: string | null;
  /** ISO start of the server-loaded events window (page ±3 months). */
  loadedRangeStart?: string;
  /** ISO end of the server-loaded events window (page ±3 months). */
  loadedRangeEnd?: string;
  /**
   * `?event=<id>` from the route's searchParams — the Travel→Calendar
   * cross-link (FairwayTripDetail's "Linked calendar event" chip). When the
   * id matches a loaded event, its detail drawer auto-opens on mount instead
   * of landing on the general calendar hub. Silently ignored if the event
   * isn't found (outside the loaded window, deleted, wrong team) — honest,
   * no error thrown for a stale link.
   */
  initialEventId?: string;
}

/** Local midnight of the day represented by the given Date. */
function toLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * ONE canonical, deterministic ordering for the merged event list (finding
 * #37/#166/#185/#83). `useCalendarRangeEvents` merges the server payload with
 * client-fetched pages into a Map whose iteration order depends on WHICH
 * fetch happened to land first — not on the event data itself — so two
 * events sharing an identical `start_time` could trade places from one
 * render to the next, even across an "identical" reload. Sorting by start
 * time with an explicit id tie-break makes the order a pure function of the
 * data, independent of fetch/merge timing. Exported standalone so it's
 * unit-testable without mounting the full orchestrator.
 */
export function sortEventsStably(list: readonly CalendarEvent[]): CalendarEvent[] {
  return [...list].sort((a, b) => {
    const aT = new Date(a.start_time || a.start_date).getTime();
    const bT = new Date(b.start_time || b.start_date).getTime();
    if (aT !== bT) return aT - bT;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

const VIEW_OPTIONS: ReadonlyArray<{ value: ViewId; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
];

export function FairwayCalendar({
  events: initialEvents,
  teamMembers,
  isCoach,
  teamTimezone,
  // Superseded by `liveUpcomingCount` below (derived from the same canonical
  // `events` list `windowCount` reads) — kept in the prop contract only for
  // the caller's SSR-first-paint API; the underscore satisfies the lint
  // ratchet's unused-vars ignore pattern.
  upcomingCount: _upcomingCount,
  serverNow,
  currentUserId,
  teamId,
  loadedRangeStart,
  loadedRangeEnd,
  initialEventId,
}: FairwayCalendarProps) {
  const router = useRouter();
  const badges = useNotificationBadges();
  // ── serverNow → nowRef deferred hydration (mirrors the legacy surface) ──────
  // MUST use `zonedMidnight` (explicit `teamTimezone`), NOT `toLocalMidnight`
  // (implicit-local getFullYear/getMonth/getDate) here: this specific call
  // computes the value BOTH the SSR pass and the very first client render
  // seed their state from, and those two passes run in DIFFERENT processes
  // (Vercel Lambda, ambient UTC vs. the visitor's own browser zone). Reading
  // `new Date(serverNow)`'s calendar fields with the process's own local zone
  // — the previous `toLocalMidnight(new Date(serverNow))` — silently
  // disagreed on "today" whenever serverNow fell inside the ~4-5h UTC/ET
  // offset window straddling midnight, which cascaded into a focusDate/
  // nowRef mismatch across the whole hero + day-strip + agenda subtree
  // (React #418 on /calendar). `zonedMidnight` derives the (y, m, d) triple
  // via `Intl.DateTimeFormat`'s explicit `timeZone` so it's identical
  // regardless of which process computes it.
  const initialFocus = React.useMemo(
    () => zonedMidnight(serverNow, teamTimezone),
    [serverNow, teamTimezone],
  );
  const [focusDate, setFocusDate] = React.useState<Date>(initialFocus);
  const [nowRef, setNowRef] = React.useState<Date>(initialFocus);

  React.useEffect(() => {
    const clientNow = toLocalMidnight(new Date());
    setNowRef(clientNow);
    setFocusDate((prev) => {
      if (
        prev.getTime() === initialFocus.getTime() &&
        clientNow.getTime() !== initialFocus.getTime()
      ) {
        return clientNow;
      }
      return prev;
    });
  }, [initialFocus]);

  // DEFAULT AGENDA — on the all-past demo the current week is empty; Agenda
  // surfaces the real Feb–Apr events immediately. Week stays one tap away.
  const [view, setView] = React.useState<ViewId>('agenda');

  // ── Visible window — varies with the active lens. ───────────────────────────
  const visibleWindow = React.useMemo(() => {
    if (view === 'month') {
      return { start: startOfMonth(focusDate), end: endOfMonth(focusDate) };
    }
    if (view === 'agenda') {
      // Agenda gets a wide window so the demo's full Feb–Apr season shows: from
      // 3 months before the focused day through 3 months after.
      return { start: addMonths(focusDate, -3), end: addMonths(focusDate, 3) };
    }
    return {
      start: startOfWeekFn(focusDate, { weekStartsOn: 0 }),
      end: endOfWeekFn(focusDate, { weekStartsOn: 0 }),
    };
  }, [focusDate, view]);

  // ── Range-driven events + ONE stable realtime channel ──────────────────────
  // Navigating outside the server's ±3-month payload now FETCHES that range
  // (with a loading affordance + retryable error state) instead of rendering
  // a silent empty calendar (audit #9, #20). The realtime channel lives in
  // the hook keyed on teamId ONLY — no leave/join per navigation — and the
  // visible range is refetched on every (re)subscribe (audit #25).
  const {
    events: rangeEvents,
    isLoadingRange,
    rangeError,
    retryRange,
    refetchVisibleRange,
  } = useCalendarRangeEvents({
    teamId: teamId ?? initialEvents[0]?.team_id ?? null,
    initialEvents,
    visibleStart: visibleWindow.start,
    visibleEnd: visibleWindow.end,
    loadedStart: loadedRangeStart,
    loadedEnd: loadedRangeEnd,
    realtime: true,
    onRealtimeEvent: () => router.refresh(),
  });

  // ── ONE canonical, deterministically-ordered event list (finding #37/#166/
  //    #185/#83) ────────────────────────────────────────────────────────────
  // The range hook merges the server payload with client-fetched pages into a
  // Map whose iteration order depends on WHICH request happened to land first
  // (fetch timing, not event data) — two events sharing an identical
  // start_time could therefore trade places from one render to the next, even
  // across an "identical" reload, because Array.prototype.sort is stable and
  // preserves whatever order it was handed. Every consumer below (hero
  // counts, day strip density, agenda buckets, month grid, the "most
  // imminent un-RSVP'd" pick) now reads this ONE re-sorted, id-tie-broken
  // list instead of the raw hook output, so ties always resolve the same way
  // regardless of fetch/merge timing.
  const events = React.useMemo(() => sortEventsStably(rangeEvents), [rangeEvents]);

  // ── Coach availability filter (avatar rail → overlay player schedules) ──────
  // Multi-select up to 8 (color-coded). Empty = "All" (team calendar). When
  // players are picked the body switches to a native availability overlay built
  // from getPlayerAvailability (their events + classes + blocked time).
  const [selectedPlayerIds, setSelectedPlayerIds] = React.useState<string[]>([]);
  const [availByPlayer, setAvailByPlayer] = React.useState<
    Map<string, { start: string; end: string; type: 'event' | 'class' | 'blocked'; title?: string }[]>
  >(new Map());
  const availabilityMode = isCoach && selectedPlayerIds.length > 0;

  // Availability fetch window — tight by view (month grid span / week / day).
  const availWindow = React.useMemo(() => {
    if (view === 'month') {
      return {
        start: startOfWeekFn(startOfMonth(focusDate), { weekStartsOn: 0 }),
        end: endOfWeekFn(endOfMonth(focusDate), { weekStartsOn: 0 }),
      };
    }
    if (view === 'day') return { start: focusDate, end: focusDate };
    return {
      start: startOfWeekFn(focusDate, { weekStartsOn: 0 }),
      end: endOfWeekFn(focusDate, { weekStartsOn: 0 }),
    };
  }, [view, focusDate]);

  React.useEffect(() => {
    if (!isCoach || selectedPlayerIds.length === 0) {
      setAvailByPlayer(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const { getPlayerAvailability } = await import('@/app/golf/actions/golf');
      const s = format(availWindow.start, 'yyyy-MM-dd');
      const e = format(availWindow.end, 'yyyy-MM-dd');
      // Anchor each player's busy window to the COACH's local day, not the UTC
      // day. Without this 4th arg getPlayerAvailability buckets by UTC, so in
      // western timezones an evening event can land on the wrong day in the
      // "find common free time" overlay (audit P237). Matches how every other
      // viewer-facing caller passes Date.getTimezoneOffset().
      const tzOffset = new Date().getTimezoneOffset();
      const results = await Promise.all(
        selectedPlayerIds.map(async (id) => {
          try {
            const r = await getPlayerAvailability(id, s, e, tzOffset);
            return [id, r.success && r.data ? r.data : []] as const;
          } catch {
            return [id, [] as { start: string; end: string; type: 'event' | 'class' | 'blocked'; title?: string }[]] as const;
          }
        }),
      );
      if (!cancelled) setAvailByPlayer(new Map(results));
    })();
    return () => {
      cancelled = true;
    };
  }, [isCoach, selectedPlayerIds, availWindow]);

  // Flatten the fetched periods into color-coded overlays (color by selection idx).
  const overlays = React.useMemo<ScheduleOverlay[]>(() => {
    if (!availabilityMode) return [];
    const out: ScheduleOverlay[] = [];
    selectedPlayerIds.forEach((id, idx) => {
      const color = PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
      const member = teamMembers.find((m) => m.id === id);
      const name = member ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || 'Player' : 'Player';
      const periods = availByPlayer.get(id) ?? [];
      periods.forEach((p, i) => {
        out.push({
          id: `${id}:${i}`,
          start: p.start,
          end: p.end,
          title: p.title || (p.type === 'class' ? 'Class' : p.type === 'blocked' ? 'Busy' : 'Event'),
          kind: p.type,
          playerName: name,
          color,
        });
      });
    });
    return out;
  }, [availabilityMode, selectedPlayerIds, availByPlayer, teamMembers]);

  // ── Coach create/edit event (Fairway editor) ───────────────────────────────
  // The editor only GATHERS form data; these handlers replicate
  // PremiumCalendarClient's payload mapping VERBATIM and call the EXACT same
  // server actions. They throw on failure so the editor surfaces the error.
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorEvent, setEditorEvent] = React.useState<CalendarEvent | null>(null);
  const [isSavingEvent, setIsSavingEvent] = React.useState(false);

  const openCreate = React.useCallback(() => {
    setEditorEvent(null);
    setEditorOpen(true);
  }, []);
  const openEdit = React.useCallback((ev: CalendarEvent) => {
    setEditorEvent(ev);
    setEditorOpen(true);
  }, []);

  const handleSaveEvent = React.useCallback(
    async (data: GolfEventFormData) => {
      setIsSavingEvent(true);
      const timezoneOffset = new Date().getTimezoneOffset();
      try {
        if (!editorEvent) {
          if (data.recurrence && data.recurrence !== 'none') {
            // Serialize the editor's STRUCTURED rule (weekday sets, biweekly,
            // until-a-date); fall back to the legacy minimal rule only when no
            // structured rule was supplied.
            const { serializeRecurrenceRule } = await import('@/lib/golf/recurrence');
            const recurrenceRule = data.recurrenceRule
              ? serializeRecurrenceRule(data.recurrenceRule)
              : `RRULE:FREQ=${data.recurrence.toUpperCase()};INTERVAL=1;COUNT=${data.recurrenceCount}`;
            const { createRecurringEvent } = await import('@/app/golf/actions/recurring-events');
            const result = await createRecurringEvent({
              title: data.title,
              eventType: data.eventType,
              startDate: data.startDate,
              endDate: data.endDate || undefined,
              startTime: data.allDay ? undefined : data.startTime || undefined,
              endTime: data.allDay ? undefined : data.endTime || undefined,
              location: data.location || undefined,
              description: data.description || undefined,
              recurrenceRule,
              requiresRsvp: data.requiresRsvp,
              rsvpDeadline: data.rsvpDeadline || undefined,
              maxAttendees: data.maxAttendees || undefined,
              timezoneOffset,
            });
            if (!result.success) throw new Error(result.error || 'Failed to create recurring event');
          } else {
            const { createGolfEvent } = await import('@/app/golf/actions/golf');
            const result = await createGolfEvent({
              title: data.title,
              eventType: data.eventType,
              startDate: data.startDate,
              endDate: data.endDate || undefined,
              startTime: data.allDay ? undefined : data.startTime || undefined,
              endTime: data.allDay ? undefined : data.endTime || undefined,
              allDay: data.allDay,
              location: data.location || undefined,
              courseName: data.courseName || undefined,
              description: data.description || undefined,
              isMandatory: data.isMandatory,
              requiresRsvp: data.requiresRsvp,
              rsvpDeadline: data.rsvpDeadline || undefined,
              maxAttendees: data.maxAttendees || undefined,
              attendeeIds: data.attendeeIds.length > 0 ? data.attendeeIds : undefined,
              timezoneOffset,
            } as never);
            if (!result.success) throw new Error(result.error || 'Failed to create event');
          }
        } else if (data.editScope && data.editScope !== 'this') {
          const { serializeRecurrenceRule } = await import('@/lib/golf/recurrence');
          const { editRecurringEvent } = await import('@/app/golf/actions/recurring-events');
          const result = await editRecurringEvent({
            eventId: editorEvent.id,
            originalStartDate: editorEvent.start_date,
            scope: data.editScope,
            timezoneOffset,
            updates: {
              title: data.title,
              description: data.description || undefined,
              startDate: data.startDate,
              endDate: data.endDate || data.startDate,
              startTime: data.allDay ? undefined : data.startTime || undefined,
              endTime: data.allDay ? undefined : data.endTime || undefined,
              location: data.location || undefined,
              // Forward a re-patterned series rule when the editor produced one.
              recurrenceRule: data.recurrenceRule
                ? serializeRecurrenceRule(data.recurrenceRule)
                : undefined,
            },
          });
          if (!result.success) throw new Error(result.error || 'Failed to update recurring event');
        } else {
          const { updateGolfEvent } = await import('@/app/golf/actions/golf');
          const result = await updateGolfEvent(editorEvent.id, {
            title: data.title,
            eventType: data.eventType,
            startDate: data.startDate,
            endDate: data.endDate || data.startDate,
            startTime: data.allDay ? undefined : data.startTime || undefined,
            endTime: data.allDay ? undefined : data.endTime || undefined,
            allDay: data.allDay,
            location: data.location || undefined,
            courseName: data.courseName || undefined,
            description: data.description || undefined,
            isMandatory: data.isMandatory,
            requiresRsvp: data.requiresRsvp,
            rsvpDeadline: data.rsvpDeadline || undefined,
            maxAttendees: data.maxAttendees || undefined,
            // ADDITIVE-ONLY attendee contract: attendeeIds/addAttendeeIds insert
            // missing rows; removals ONLY happen via explicit removeAttendeeIds.
            attendeeIds: data.attendeeIds.length > 0 ? data.attendeeIds : undefined,
            addAttendeeIds: data.addAttendeeIds,
            removeAttendeeIds: data.removeAttendeeIds,
            timezoneOffset,
          } as never);
          if (!result.success) throw new Error(result.error || 'Failed to update event');
        }
        const wasCreate = !editorEvent;
        const isSeriesEdit = !wasCreate && data.editScope != null && data.editScope !== 'this';
        // Visible confirmation of system status (audit P238) — every successful
        // mutation gives one consistent Fairway toast.
        fairwayToast.success(
          wasCreate ? 'Event created' : isSeriesEdit ? 'Series updated' : 'Event updated',
        );
        setEditorOpen(false);
        setEditorEvent(null);
        // A newly created event must never silently vanish: if its date falls
        // outside the visible window, move focus there — the range hook then
        // loads that window (audit #9).
        if (wasCreate && data.startDate) {
          const [y, mo, d] = data.startDate.slice(0, 10).split('-').map(Number);
          if (y && mo && d) {
            const eventDay = new Date(y, mo - 1, d);
            if (
              eventDay.getTime() < visibleWindow.start.getTime() ||
              eventDay.getTime() > visibleWindow.end.getTime() + 24 * 60 * 60 * 1000 - 1
            ) {
              setFocusDate(eventDay);
            }
          }
        }
        router.refresh();
        // Force-refetch the visible client range too (finding #37/#166/#185/
        // #83): router.refresh() alone re-renders the server component, but
        // this mutation's OWN edit can land outside that fresh SSR window
        // (e.g. moved far in the future) while the client range-fetch cache
        // still holds the pre-edit row. Without this, the stale row only
        // clears once a laggy realtime echo of the same write arrives.
        refetchVisibleRange();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
          window.location.reload();
          return;
        }
        throw err;
      } finally {
        setIsSavingEvent(false);
      }
    },
    [editorEvent, router, visibleWindow, refetchVisibleRange],
  );

  // Restore (un-cancel) a soft-cancelled event. Flips status back to
  // 'confirmed' via the SAME updateGolfEvent action (which also clears the
  // cancellation bookkeeping) — non-destructive, no row delete/re-insert.
  // Mirrors handleSaveEvent's stale-deployment recovery + refresh.
  const handleRestoreEvent = React.useCallback(async () => {
    if (!editorEvent) return;
    setIsSavingEvent(true);
    try {
      const { updateGolfEvent } = await import('@/app/golf/actions/golf');
      const result = await updateGolfEvent(editorEvent.id, { status: 'confirmed' } as never);
      if (!result.success) throw new Error(result.error || 'Failed to restore event');
      fairwayToast.success('Event restored');
      setEditorOpen(false);
      setEditorEvent(null);
      router.refresh();
      refetchVisibleRange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
        window.location.reload();
        return;
      }
      throw err;
    } finally {
      setIsSavingEvent(false);
    }
  }, [editorEvent, router, refetchVisibleRange]);

  const handleDeleteEvent = React.useCallback(
    async (scope?: RecurringEditScope) => {
      if (!editorEvent) return;
      setIsSavingEvent(true);
      try {
        if (scope && scope !== 'this') {
          const { deleteRecurringEvent } = await import('@/app/golf/actions/recurring-events');
          const result = await deleteRecurringEvent(editorEvent.id, editorEvent.start_date, scope);
          if (!result.success) throw new Error(result.error || 'Failed to delete recurring event');
        } else {
          const { deleteGolfEvent } = await import('@/app/golf/actions/golf');
          const result = await deleteGolfEvent(editorEvent.id);
          if (!result.success) throw new Error(result.error || 'Failed to delete event');
        }
        fairwayToast.success(
          scope && scope !== 'this' ? 'Series cancelled' : 'Event cancelled',
        );
        setEditorOpen(false);
        setEditorEvent(null);
        router.refresh();
        // Force-refetch the visible client range too (finding #37/#166/#185/
        // #83): router.refresh() alone re-renders the server component, but
        // this mutation's OWN edit can land outside that fresh SSR window
        // (e.g. moved far in the future) while the client range-fetch cache
        // still holds the pre-edit row. Without this, the stale row only
        // clears once a laggy realtime echo of the same write arrives.
        refetchVisibleRange();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
          window.location.reload();
          return;
        }
        throw err;
      } finally {
        setIsSavingEvent(false);
      }
    },
    [editorEvent, router, refetchVisibleRange],
  );

  // Permanently erase an already-cancelled event (deleteGolfEventPermanently
  // — server-gated to cancelled-or-zero-attendance events). Previously this
  // action existed but had NO UI entry point; it's now wired behind the
  // editor's "Delete permanently" confirm (finding #45/#113/#181).
  const handlePermanentDelete = React.useCallback(async () => {
    if (!editorEvent) return;
    setIsSavingEvent(true);
    try {
      const { deleteGolfEventPermanently } = await import('@/app/golf/actions/golf');
      const result = await deleteGolfEventPermanently(editorEvent.id);
      if (!result.success) throw new Error(result.error || 'Failed to delete event permanently');
      fairwayToast.success('Event deleted permanently');
      setEditorOpen(false);
      setEditorEvent(null);
      router.refresh();
      refetchVisibleRange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
        window.location.reload();
        return;
      }
      throw err;
    } finally {
      setIsSavingEvent(false);
    }
  }, [editorEvent, router, refetchVisibleRange]);

  // ── ICS "Add to phone" sheet — reachable for BOTH roles incl. mobile. ──────
  const [subscribeOpen, setSubscribeOpen] = React.useState(false);

  // ── Drawer + RSVP state — EVERY view (Agenda / Day / Week / Month) opens the
  //    SAME Fairway drawer; the legacy EventDetailModal is retired (audit P232).
  const [drawerEvent, setDrawerEvent] = React.useState<CalendarEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [userRsvpStatuses, setUserRsvpStatuses] = React.useState<Map<string, RSVPStatus>>(
    new Map(),
  );
  const [drawerRsvpSummary, setDrawerRsvpSummary] = React.useState<{
    accepted: number;
    declined: number;
    tentative: number;
    pending: number;
    total: number;
  } | null>(null);

  // Count of events in the visible window (for the hero status line). Day
  // view is special-cased: `visibleWindow` for 'day' reuses the WEEK range
  // (a fetch-buffer implementation detail — see visibleWindow above), but the
  // Day body (FairwayAgendaView mode="day") only ever shows `focusDate`'s own
  // events, so the hero count must match what's actually on screen instead of
  // silently counting the whole week (mustFix #4).
  const windowCount = React.useMemo(() => {
    if (view === 'day') {
      return events.filter((e) => {
        const s = e.start_date || e.start_time;
        if (!s) return false;
        // Zoned bucketing (not implicit-local `new Date(s)`) — must agree
        // with what FairwayAgendaView mode="day" actually renders for the
        // same day (both bucket by `teamTimezone`), or the hero count and
        // the visible list could silently disagree near a midnight boundary.
        return isSameDay(eventCalendarDay(s, e.all_day, teamTimezone), focusDate);
      }).length;
    }
    const startMs = visibleWindow.start.getTime();
    const endMs = visibleWindow.end.getTime() + 24 * 60 * 60 * 1000 - 1;
    return events.filter((e) => {
      const s = e.start_time || e.start_date;
      if (!s) return false;
      const t = new Date(s).getTime();
      return t >= startMs && t <= endMs;
    }).length;
  }, [events, visibleWindow, view, focusDate, teamTimezone]);

  // Upcoming count — derived from the SAME canonical `events` list as
  // `windowCount` (finding #37/#166/#185/#83). The server-computed
  // `upcomingCount` prop is a SEPARATE read of the same underlying table at a
  // slightly different instant (its own count query vs. this page's own
  // fetch+merge), so the hero previously showed two numbers that could each
  // change independently — one canonical read path now feeds both. `nowRef`
  // starts equal to `serverNow` (hydration-safe: identical on the first
  // client render, so no SSR/CSR mismatch), then promotes to the real client
  // clock exactly like every other "now" in this surface.
  const liveUpcomingCount = React.useMemo(() => {
    const nowMs = nowRef.getTime();
    return events.filter((e) => {
      const s = e.start_time || e.start_date;
      if (!s) return false;
      return new Date(s).getTime() >= nowMs;
    }).length;
  }, [events, nowRef]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigate = React.useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      if (direction === 'today') {
        const now = new Date();
        setFocusDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
        return;
      }
      const dir = direction === 'next' ? 1 : -1;
      if (view === 'month') {
        setFocusDate((d) => addMonths(d, dir));
      } else {
        // Day/Week/Agenda turn the page by a week (the day-strip is the picker).
        setFocusDate((d) => addDays(d, dir * 7));
      }
    },
    [view],
  );

  // Keyboard: ←/→ + T. The Fairway shell is the SOLE calendar-navigation
  // keyboard owner — the legacy PremiumCalendarClient grid (which bound its own
  // nav keys) is retired on this route (audit P232/P244), so there is no second
  // handler to desync with. Suppressed only while our drawer is open or an input
  // is focused.
  React.useEffect(() => {
    if (drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
          return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate('next');
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        navigate('today');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, drawerOpen]);

  // ── Drawer plumbing — REUSES the existing getEventRSVP / getPlayerEventRSVP
  //    (lazy import, exactly as the legacy editorial drawer). ─────────────────
  const openDrawerForEvent = React.useCallback(
    async (event: CalendarEvent) => {
      setDrawerEvent(event);
      setDrawerOpen(true);
      setDrawerRsvpSummary(null);

      if (isCoach) {
        try {
          const { getEventRSVP } = await import('@/app/golf/actions/golf');
          const result = await getEventRSVP(event.id);
          if (result.success && result.data?.summary) {
            const s = result.data.summary;
            setDrawerRsvpSummary({
              accepted: s.accepted ?? 0,
              declined: s.declined ?? 0,
              tentative: s.tentative ?? 0,
              pending: s.pending ?? 0,
              total: s.total ?? 0,
            });
          }
        } catch {
          // Drawer still works without the summary.
        }
      } else if (!userRsvpStatuses.has(event.id)) {
        try {
          const { getPlayerEventRSVP } = await import('@/app/golf/actions/golf');
          const result = await getPlayerEventRSVP(event.id);
          if (result.success && result.data?.status) {
            setUserRsvpStatuses((prev) => {
              const next = new Map(prev);
              next.set(event.id, result.data!.status as RSVPStatus);
              return next;
            });
          }
        } catch {
          // Default to no status — drawer still allows responding.
        }
      }
    },
    [isCoach, userRsvpStatuses],
  );

  // ── Deep-link auto-open (Travel→Calendar cross-link, P440 symmetric fix) ──
  // FairwayTripDetail's "Linked calendar event" chip deep-links here with
  // `?event=<id>` instead of just landing on the general hub. Opens the
  // matching event's drawer ONCE the id is found in the loaded range — a ref
  // guards against re-opening after the coach/player closes it (events can
  // reload via realtime/router.refresh()). Silently no-ops if the event never
  // shows up (outside the ±3-month window, deleted, wrong team) — honest,
  // never an error for a stale link.
  const autoOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialEventId || autoOpenedRef.current) return;
    const match = events.find((e) => e.id === initialEventId);
    if (!match) return;
    autoOpenedRef.current = true;
    void openDrawerForEvent(match);
  }, [initialEventId, events, openDrawerForEvent]);

  // Player RSVP submit — REUSES the existing respondToEvent action UNCHANGED.
  // Typed lock codes (deadline passed / event started / cancelled) are passed
  // through so the drawer can render a specific locked state.
  const handleRespond = React.useCallback(
    async (eventId: string, status: RSVPStatus): Promise<RsvpRespondResult> => {
      try {
        const { respondToEvent } = await import('@/app/golf/actions/golf');
        const result = await respondToEvent(eventId, status);
        if (result.success) {
          setUserRsvpStatuses((prev) => {
            const next = new Map(prev);
            next.set(eventId, status);
            return next;
          });
          // Visible confirmation of the saved response (audit P238) — the drawer
          // otherwise just soft-closes with no feedback.
          fairwayToast.success(
            status === 'accepted'
              ? "You're going"
              : status === 'tentative'
                ? 'Marked maybe'
                : status === 'declined'
                  ? 'Marked not going'
                  : 'Response saved',
          );
          // The "Awaiting RSVP" calendar-notification badge is a separate
          // polled feed — refetch it so it drops immediately instead of
          // waiting up to 45s (conn-golf-player Finding 3; this was the one
          // RSVP entry point with no badge call at all).
          badges.refetch();
          return { success: true };
        }
        return {
          success: false,
          error: result.error ?? 'Could not save your response.',
          code: readRsvpLockCode(result),
        };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
    [badges],
  );

  // ── The ONE primary action ──────────────────────────────────────────────────
  // Coach: "New event" → the native FairwayEventEditor (openCreate). This is the
  // SINGLE create surface on every view (audit P240): the legacy grid create
  // entry points (QuickAddEventFAB, grid "+", N-key → EventDetailModal) are gone
  // because the legacy PremiumCalendarClient grid is retired on this route
  // (audit P232). No competing create UI is reachable.
  const mostImminentUnrsvpd = React.useMemo(() => {
    if (isCoach) return null;
    const nowMs = new Date(serverNow).getTime();
    return (
      events
        .filter((e) => {
          if (e.requires_rsvp === false) return false;
          if (e.status === 'cancelled') return false; // never prompt for cancelled events
          const s = e.start_time || e.start_date;
          if (!s) return false;
          if (new Date(s).getTime() < nowMs) return false; // future only
          const status = userRsvpStatuses.get(e.id);
          return status == null || status === 'pending';
        })
        .sort(
          (a, b) =>
            new Date(a.start_time || a.start_date).getTime() -
            new Date(b.start_time || b.start_date).getTime(),
        )[0] ?? null
    );
  }, [isCoach, events, serverNow, userRsvpStatuses]);

  const handlePrimaryAction = React.useCallback(() => {
    if (isCoach) {
      // Open the native Fairway create-event editor.
      openCreate();
      return;
    }
    if (mostImminentUnrsvpd) {
      void openDrawerForEvent(mostImminentUnrsvpd);
    }
  }, [isCoach, mostImminentUnrsvpd, openDrawerForEvent, openCreate]);

  // Player "Respond" only renders when there is something to respond to; on the
  // all-past demo (0 future events) it degrades to calm browse (no fake CTA).
  const primaryAction =
    isCoach || mostImminentUnrsvpd ? handlePrimaryAction : undefined;
  const primaryActionLabel = isCoach ? 'New event' : 'Respond';

  const isAgenda = view === 'agenda';
  const isDay = view === 'day';

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-2 md:gap-6 md:px-6">
      {/* ── ONE HERO (plinth + day strip) ────────────────────────────────────── */}
      <FairwayCalendarHero
        focusDate={focusDate}
        selectedDate={focusDate}
        events={events}
        nowRef={nowRef}
        upcomingCount={liveUpcomingCount}
        windowCount={windowCount}
        isMonthView={view === 'month'}
        isAgendaView={isAgenda}
        isDayView={isDay}
        isCoach={isCoach}
        onNavigate={navigate}
        onSelectDate={(d) => setFocusDate(d)}
        onPrimaryAction={primaryAction}
        primaryActionLabel={primaryActionLabel}
        teamTimezone={teamTimezone}
      />

      {/* ── View toggle (default Agenda) + Subscribe entry point ─────────────── */}
      {/* "Add to phone" is reachable for BOTH roles, including mobile — the
          flagship "team schedule in my phone" path was previously desktop-
          coach-only (audit finding #10). Stacks (Segmented full-width, then
          the button at its natural size) below `sm`; on `sm`+ it's the
          original side-by-side row. `flex-wrap` alone (Segmented shrinking
          via `min-w-0 flex-1` + its own internal scroll-fade) left the two
          controls sharing one line at phone widths, where the button's
          `whitespace-nowrap` label floors it at its natural width and
          crowds/overlaps the segmented control's clipped tail — the same
          stack-then-row idiom used elsewhere in Fairway (e.g. ViewHeader,
          FairwayQualifierDetail) sidesteps that shrink math entirely. */}
      <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <Segmented<ViewId>
            options={VIEW_OPTIONS}
            value={view}
            onValueChange={setView}
            // `lg` = 44px segments — this is the single most-used calendar
            // control on mobile; it must clear the WCAG 2.2 AA touch target.
            size="lg"
            fullWidth
            aria-label="Calendar view"
          />
        </div>
        <FwButton
          variant="secondary"
          size="sm"
          leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden />}
          onClick={() => setSubscribeOpen(true)}
        >
          Add to phone
        </FwButton>
      </div>

      {/* ── Range-fetch affordances (loading + retryable error ≠ empty) ──────── */}
      {isLoadingRange ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2.5 rounded-fw-md bg-surface-sunken px-4 py-2.5"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent-500" aria-hidden />
          <span className="font-fw-sans text-caption text-text-tertiary">
            Loading events for this date range…
          </span>
        </div>
      ) : null}
      {rangeError && !isLoadingRange ? (
        <div className="flex items-center justify-between gap-3 rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-2.5">
          <span className="font-fw-sans text-caption text-fw-danger-ink">{rangeError}</span>
          <FwButton
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            onClick={retryRange}
          >
            Retry
          </FwButton>
        </div>
      ) : null}

      {/* ── Coach member rail (avatar filter → availability overlay) ──────────── */}
      {/* The whole body is now native Fairway in every view (the legacy grid +
          its own avatar sidebar are retired — audit P232), so the ONE member rail
          is shown for coaches across all lenses. */}
      {isCoach ? (
        <FairwayCalendarMemberRail
          teamMembers={teamMembers}
          selectedPlayerIds={selectedPlayerIds}
          onSelect={setSelectedPlayerIds}
        />
      ) : null}

      {/* ── BODY ─────────────────────────────────────────────────────────────── */}
      {availabilityMode ? (
        // ── Coach availability overlay — selected players' schedules, color-coded
        //    (their team events + classes + blocked). Month → grid overlay; other
        //    lenses → grouped-by-day list. Built from getPlayerAvailability. ─────
        view === 'month' ? (
          <FairwayMonthGrid
            events={[]}
            overlays={overlays}
            focusDate={focusDate}
            nowRef={nowRef}
            timezone={teamTimezone}
            onSelectDate={(d) => {
              setFocusDate(d);
              setView('day');
            }}
          />
        ) : (
          <FairwayAvailabilityList
            overlays={overlays}
            rangeStart={availWindow.start}
            rangeEnd={availWindow.end}
            nowRef={nowRef}
            timezone={teamTimezone}
          />
        )
      ) : isAgenda ? (
        <FairwayAgendaView
          events={events}
          mode="range"
          focusDate={focusDate}
          rangeStart={visibleWindow.start}
          rangeEnd={visibleWindow.end}
          isCoach={isCoach}
          userRsvpStatuses={userRsvpStatuses}
          timezone={teamTimezone}
          onEventClick={openDrawerForEvent}
          onCreateEvent={isCoach ? handlePrimaryAction : undefined}
          nowRef={nowRef}
        />
      ) : isDay ? (
        <FairwayAgendaView
          events={events}
          mode="day"
          focusDate={focusDate}
          isCoach={isCoach}
          userRsvpStatuses={userRsvpStatuses}
          timezone={teamTimezone}
          onEventClick={openDrawerForEvent}
          onCreateEvent={isCoach ? handlePrimaryAction : undefined}
          nowRef={nowRef}
        />
      ) : view === 'month' ? (
        // ── Week / Month → fully-native Fairway for BOTH roles (audit P232).
        //    The Fairway shell ALREADY owns every piece of calendar chrome: ONE
        //    hero (prev/today/next + "New event"), ONE Segmented view toggle, and
        //    ONE member rail. The legacy PremiumCalendarClient grid was previously
        //    mounted here for coaches and brought its OWN CalendarHeader (a second
        //    Day/Week/Month toggle), its own CalendarAvatarSidebar, and its own
        //    QuickAddEventFAB — so a coach saw two of everything in two visual
        //    languages. We retire the legacy grid on this route and render the
        //    native grid the player branch already proved out. Coaches still get
        //    full create (hero "New event" → FairwayEventEditor) and edit/delete/
        //    restore (tap an event → Fairway drawer → Edit → FairwayEventEditor),
        //    all wired to the SAME server actions the legacy grid called.
        <FairwayMonthGrid
          events={events}
          focusDate={focusDate}
          nowRef={nowRef}
          timezone={teamTimezone}
          onEventClick={openDrawerForEvent}
          onSelectDate={(d) => {
            setFocusDate(d);
            setView('day');
          }}
        />
      ) : (
        // ── Week → a week-scoped agenda for BOTH roles (sparse golf calendars
        //    read better as a list than a time-grid). Opens the same Fairway
        //    drawer; coaches get the "New event" CTA on the empty state. ────────
        <FairwayAgendaView
          events={events}
          mode="range"
          focusDate={focusDate}
          rangeStart={visibleWindow.start}
          rangeEnd={visibleWindow.end}
          isCoach={isCoach}
          userRsvpStatuses={userRsvpStatuses}
          timezone={teamTimezone}
          onEventClick={openDrawerForEvent}
          onCreateEvent={isCoach ? handlePrimaryAction : undefined}
          nowRef={nowRef}
        />
      )}

      {/* ── DETAIL DRAWER — the single event-detail surface for every view ────── */}
      <FairwayEventDetailDrawer
        event={drawerEvent}
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) {
            // Clear lazily so the drawer's exit animation finishes.
            setTimeout(() => setDrawerEvent(null), 240);
          }
        }}
        isCoach={isCoach}
        rsvpStatus={drawerEvent ? userRsvpStatuses.get(drawerEvent.id) ?? null : null}
        rsvpSummary={drawerRsvpSummary}
        onRespond={!isCoach ? handleRespond : undefined}
        onEdit={
          isCoach
            ? (ev) => {
                setDrawerOpen(false);
                openEdit(ev);
              }
            : undefined
        }
        timezone={teamTimezone}
      />

      {/* ── Coach create / edit event editor (native Fairway) ─────────────────── */}
      {isCoach ? (
        <FairwayEventEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          event={editorEvent}
          isCoach={isCoach}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onRestore={handleRestoreEvent}
          onDeletePermanently={handlePermanentDelete}
          isSaving={isSavingEvent}
          teamPlayers={teamMembers}
          currentUserId={currentUserId}
          timezone={teamTimezone}
        />
      ) : null}

      {/* ── Subscribe / Add to phone (ICS feeds — reuses the legacy manager) ──── */}
      <FairwaySubscribeSheet
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        canManageTeamFeed={isCoach && Boolean(teamId ?? initialEvents[0]?.team_id)}
      />
    </div>
  );
}

// ============================================================================
// FairwaySubscribeSheet — ICS feed manager in a Fairway Sheet
// ----------------------------------------------------------------------------
// Reuses the EXISTING CalendarFeedManager (FeedCard + SubscriptionInstructions
// + calendar-feeds server actions) UNCHANGED — same plumbing as the legacy
// GolfCalendarWrapper drawer, surfaced where players and mobile coaches can
// actually reach it (audit finding #10). The manager chunk loads on first open.
// ============================================================================
interface FairwaySubscribeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Coaches manage the team feed; players get a personal feed only. */
  canManageTeamFeed: boolean;
}

function FairwaySubscribeSheet({ open, onOpenChange, canManageTeamFeed }: FairwaySubscribeSheetProps) {
  const [feeds, setFeeds] = React.useState<CalendarFeed[]>([]);
  const [feedsLoading, setFeedsLoading] = React.useState(false);
  const [feedsError, setFeedsError] = React.useState<string | null>(null);
  const allowedTypes = React.useMemo<FeedType[]>(
    () => (canManageTeamFeed ? ['team', 'personal'] : ['personal']),
    [canManageTeamFeed],
  );

  const loadFeeds = React.useCallback(async () => {
    setFeedsLoading(true);
    setFeedsError(null);
    try {
      const { getCalendarFeeds } = await loadCalendarFeedActions();
      const result = await getCalendarFeeds();
      if (result.success && result.data) {
        setFeeds(result.data);
      } else {
        setFeeds([]);
        setFeedsError(result.error || 'Failed to load calendar feeds');
      }
    } catch {
      setFeeds([]);
      setFeedsError('Unable to load calendar feeds. Please check your connection and try again.');
    }
    setFeedsLoading(false);
  }, []);

  React.useEffect(() => {
    if (open) void loadFeeds();
  }, [open, loadFeeds]);

  const handleCreateFeed = React.useCallback(
    async (type: FeedType, _name: string) => {
      void _name;
      if (type === 'team' && !canManageTeamFeed) {
        setFeedsError('Only coaches can manage team feeds');
        throw new Error('Only coaches can manage team feeds');
      }
      const { createCalendarFeed } = await loadCalendarFeedActions();
      const result = await createCalendarFeed(type as 'team' | 'personal');
      if (!result.success || !result.data) {
        setFeedsError(result.error || 'Failed to create feed');
        throw new Error(result.error || 'Failed to create feed');
      }
      setFeeds((prev) => {
        const existingIndex = prev.findIndex((feed) => feed.type === type);
        if (existingIndex === -1) return [...prev, result.data!];
        const next = [...prev];
        next[existingIndex] = result.data!;
        return next;
      });
      return result.data;
    },
    [canManageTeamFeed],
  );

  const handleRegenerateFeed = React.useCallback(
    async (feedId: string) => {
      const target = feeds.find((feed) => feed.id === feedId);
      if (!target) return;
      if (target.type === 'team' && !canManageTeamFeed) {
        setFeedsError('Only coaches can manage team feeds');
        return;
      }
      const { regenerateCalendarFeed } = await loadCalendarFeedActions();
      const result = await regenerateCalendarFeed(target.type as 'team' | 'personal');
      if (!result.success || !result.data) {
        setFeedsError(result.error || 'Failed to regenerate feed');
        throw new Error(result.error || 'Failed to regenerate feed');
      }
      setFeeds((prev) => prev.map((feed) => (feed.id === feedId ? result.data! : feed)));
    },
    [feeds, canManageTeamFeed],
  );

  const handleDeleteFeed = React.useCallback(
    async (feedId: string) => {
      const target = feeds.find((feed) => feed.id === feedId);
      if (!target) return;
      if (target.type === 'team' && !canManageTeamFeed) {
        setFeedsError('Only coaches can manage team feeds');
        return;
      }
      const { deleteCalendarFeed } = await loadCalendarFeedActions();
      const result = await deleteCalendarFeed(target.type as 'team' | 'personal');
      if (!result.success) {
        setFeedsError(result.error || 'Failed to disable feed');
        throw new Error(result.error || 'Failed to disable feed');
      }
      setFeeds((prev) => prev.filter((feed) => feed.id !== feedId));
    },
    [feeds, canManageTeamFeed],
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title="Subscribe to your calendar"
      className="sm:mx-auto sm:max-w-xl"
    >
      <Sheet.Body className="flex flex-col gap-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <p className="font-fw-sans text-body-sm text-text-secondary">
          Add the team schedule to Apple Calendar, Google Calendar, or Outlook. It stays in sync
          automatically when events change.
        </p>
        {feedsError ? (
          <p className="font-fw-sans text-caption text-fw-danger-ink">{feedsError}</p>
        ) : null}
        {/* Genuinely-empty (loaded, no error, zero feeds): a Fairway-framed hint
            so the empty Subscribe sheet doesn't lean only on the legacy child's
            empty state (audit P242). */}
        {!feedsLoading && !feedsError && feeds.length === 0 ? (
          <p className="font-fw-sans text-caption text-text-tertiary">
            You don&apos;t have a feed yet — create one below to sync this calendar to your phone.
          </p>
        ) : null}
        {feedsLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading calendar feeds">
            <Skeleton className="h-16 rounded-fw-md" />
            <Skeleton className="h-16 rounded-fw-md" />
          </div>
        ) : (
          <CalendarFeedManager
            feeds={feeds}
            onCreateFeed={handleCreateFeed}
            onRegenerateFeed={handleRegenerateFeed}
            onDeleteFeed={handleDeleteFeed}
            allowedTypes={allowedTypes}
            showNameInput={false}
          />
        )}
      </Sheet.Body>
    </Sheet>
  );
}
