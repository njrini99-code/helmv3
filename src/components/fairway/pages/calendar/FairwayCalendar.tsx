'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendar — the flag-on Calendar SHELL orchestrator
 * ----------------------------------------------------------------------------
 * The single re-skinned Calendar surface for /golf/dashboard/calendar behind the
 * isRedesignEnabled() fork. It RE-SKINS THE SHELL and REUSES THE LEGACY ENGINE
 * UNCHANGED — it does NOT rebuild the heavy machinery.
 *
 * ── WHAT IS REUSED UNCHANGED (cite) ─────────────────────────────────────────
 *   • Week/Month grid, @dnd-kit drag-to-reschedule, the 'calendar-events'
 *     Supabase realtime channel, EventDetailModal (create/edit/delete +
 *     recurring-series scope picker), MobileEventSheet, QuickAddEventFAB and
 *     the CalendarFeedManager ALL live inside PremiumCalendarClient, which we
 *     render via its existing <GolfCalendarWrapper> wrapper UNCHANGED — same
 *     wiring the legacy editorial surface used (EditorialCalendarSurface's
 *     LegacyGridShell). We hand it `initialEvents` / `teamMembers` / `isCoach`
 *     / `teamTimezone` / `initialView` / `initialDate` and key it on
 *     `${view}:${date}` so a view switch remounts it with the right seed.
 *   • The player RSVP write path is the EXISTING `respondToEvent` server action
 *     (→ updateRSVP into golf_event_attendance); the coach attendance summary is
 *     the EXISTING `getEventRSVP` (→ getEventRSVPStats). We lazy-import both,
 *     exactly as the legacy editorial drawer did. NO new writes.
 *
 * ── WHAT WE RE-SKIN (our SHELL pass) ────────────────────────────────────────
 *   the hero plinth, the day-strip, the Agenda body, the segmented view toggle,
 *   and the event-detail drawer chrome — all in Fairway tokens.
 *
 * ── ROLE BRANCH (isCoach, resolved server-side) ─────────────────────────────
 *   coach  → "New event" primary (→ legacy create flow) + read-only attendance
 *            Readouts + drag-to-reschedule (inside the legacy grid).
 *   player → "Respond" primary on the most-imminent un-RSVP'd event + 3-button
 *            RSVP control; read-only events, no FAB, no DnD.
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
} from 'date-fns';
import { CalendarPlus, RefreshCw } from 'lucide-react';
import { Segmented, Sheet, Button as FwButton, Skeleton } from '@/components/fairway';
import { GolfCalendarWrapper } from '@/components/golf/calendar/GolfCalendarWrapper';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { TeamMember } from '@/components/golf/calendar/PremiumCalendarClient';
import type { RSVPStatus, RsvpRespondResult } from '@/hooks/useRSVP';
import { readRsvpLockCode } from '@/hooks/useRSVP';
import { useCalendarRangeEvents } from '@/hooks/golf/use-calendar-range-events';
import { useRouter } from 'next/navigation';
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
}

/** Local midnight of the day represented by the given Date. */
function toLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
  upcomingCount,
  serverNow,
  currentUserId,
  teamId,
  loadedRangeStart,
  loadedRangeEnd,
}: FairwayCalendarProps) {
  const router = useRouter();
  // ── serverNow → nowRef deferred hydration (mirrors the legacy surface) ──────
  const initialFocus = React.useMemo(() => toLocalMidnight(new Date(serverNow)), [serverNow]);
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
    events,
    isLoadingRange,
    rangeError,
    retryRange,
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
      const results = await Promise.all(
        selectedPlayerIds.map(async (id) => {
          try {
            const r = await getPlayerAvailability(id, s, e);
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
    [editorEvent, router, visibleWindow],
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
      setEditorOpen(false);
      setEditorEvent(null);
      router.refresh();
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
  }, [editorEvent, router]);

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
        setEditorOpen(false);
        setEditorEvent(null);
        router.refresh();
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
    [editorEvent, router],
  );

  // ── ICS "Add to phone" sheet — reachable for BOTH roles incl. mobile. ──────
  const [subscribeOpen, setSubscribeOpen] = React.useState(false);

  // ── Drawer + RSVP state (Agenda taps open the Fairway drawer; the Week/Month
  //    grid keeps opening the legacy EventDetailModal inside the wrapper). ─────
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

  // Count of events in the visible window (for the hero status line).
  const windowCount = React.useMemo(() => {
    const startMs = visibleWindow.start.getTime();
    const endMs = visibleWindow.end.getTime() + 24 * 60 * 60 * 1000 - 1;
    return events.filter((e) => {
      const s = e.start_time || e.start_date;
      if (!s) return false;
      const t = new Date(s).getTime();
      return t >= startMs && t <= endMs;
    }).length;
  }, [events, visibleWindow]);

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

  // Keyboard: ←/→ + T. Suppressed while our drawer is open or an input is
  // focused; the legacy PremiumCalendarClient owns its own modal-keyboard
  // contract when the grid is mounted.
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
    [],
  );

  // ── The ONE primary action ──────────────────────────────────────────────────
  // Coach: "New event". The legacy create flow (EventDetailModal create) lives
  // inside PremiumCalendarClient — reachable via its FAB (mobile) and grid "+"
  // / N-key (desktop). We DON'T edit the engine to lift that handler out, so the
  // hero CTA routes the coach to the Week grid where the full legacy create
  // surface is mounted and ready. Honest + non-destructive.
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
        upcomingCount={upcomingCount}
        windowCount={windowCount}
        isMonthView={view === 'month'}
        isAgendaView={isAgenda}
        isCoach={isCoach}
        onNavigate={navigate}
        onSelectDate={(d) => setFocusDate(d)}
        onPrimaryAction={primaryAction}
        primaryActionLabel={primaryActionLabel}
      />

      {/* ── View toggle (default Agenda) + Subscribe entry point ─────────────── */}
      {/* "Add to phone" is reachable for BOTH roles, including mobile — the
          flagship "team schedule in my phone" path was previously desktop-
          coach-only (audit finding #10). */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <Segmented<ViewId>
            options={VIEW_OPTIONS}
            value={view}
            onValueChange={setView}
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
          <span className="font-fw-sans text-caption text-fw-danger">{rangeError}</span>
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
      {/* Shown where the body is native (agenda/day) or while comparing — NOT over
          the legacy grid (All-mode Week/Month), which keeps its own sidebar. */}
      {isCoach && (isAgenda || isDay || availabilityMode) ? (
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
          onEventClick={openDrawerForEvent}
          onCreateEvent={isCoach ? handlePrimaryAction : undefined}
          nowRef={nowRef}
        />
      ) : !isCoach ? (
        // ── PLAYER Week / Month → fully-native Fairway (no legacy grid chrome).
        //    The legacy PremiumCalendarClient brought a member-filter rail, an
        //    "+ Add Event" button, and a duplicate Day/Week/Month toggle — coach
        //    tooling a read-only player neither needs nor should see, doubling the
        //    Fairway hero + segmented. Month → native FairwayMonthGrid; Week →
        //    a week-scoped agenda (sparse golf calendars read better as a list
        //    than a time-grid). Both open the same Fairway drawer. ─────────────
        view === 'month' ? (
          <FairwayMonthGrid
            events={events}
            focusDate={focusDate}
            nowRef={nowRef}
            onEventClick={openDrawerForEvent}
            onSelectDate={(d) => {
              setFocusDate(d);
              setView('day');
            }}
          />
        ) : (
          <FairwayAgendaView
            events={events}
            mode="range"
            focusDate={focusDate}
            rangeStart={visibleWindow.start}
            rangeEnd={visibleWindow.end}
            isCoach={isCoach}
            userRsvpStatuses={userRsvpStatuses}
            onEventClick={openDrawerForEvent}
            nowRef={nowRef}
          />
        )
      ) : (
        // ── COACH Week / Month → REUSE the legacy PremiumCalendarClient grid
        //    UNCHANGED via its existing GolfCalendarWrapper. Coaches need its
        //    create flow (EventDetailModal via FAB / grid "+" / N), drag-to-
        //    reschedule, recurring-series, and realtime — the engine the shell
        //    deliberately reuses. NO key: the grid FOLLOWS initialView /
        //    initialDate prop changes internally, so navigating no longer
        //    remounts it (which tore down and rejoined its realtime channel on
        //    every navigation — audit finding #25). ─────────────────────────────
        <div className="overflow-hidden rounded-card">
          <GolfCalendarWrapper
            initialEvents={events}
            teamMembers={teamMembers}
            isCoach={isCoach}
            teamTimezone={teamTimezone}
            initialView={view as 'week' | 'month'}
            initialDate={focusDate}
          />
        </div>
      )}

      {/* ── DETAIL DRAWER (Agenda taps; the grid uses the legacy modal) ───────── */}
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
          <p className="font-fw-sans text-caption text-fw-danger">{feedsError}</p>
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

export default FairwayCalendar;
