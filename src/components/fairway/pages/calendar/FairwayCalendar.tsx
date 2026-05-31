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
import {
  format,
  startOfWeek as startOfWeekFn,
  endOfWeek as endOfWeekFn,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
} from 'date-fns';
import { Segmented } from '@/components/fairway';
import { GolfCalendarWrapper } from '@/components/golf/calendar/GolfCalendarWrapper';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { TeamMember } from '@/components/golf/calendar/PremiumCalendarClient';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { FairwayCalendarHero } from './FairwayCalendarHero';
import { FairwayAgendaView } from './FairwayAgendaView';
import { FairwayMonthGrid } from './FairwayMonthGrid';
import { FairwayEventDetailDrawer } from './FairwayEventDetailDrawer';

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
  events,
  teamMembers,
  isCoach,
  teamTimezone,
  upcomingCount,
  serverNow,
}: FairwayCalendarProps) {
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
  const handleRespond = React.useCallback(
    async (eventId: string, status: RSVPStatus) => {
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
        return { success: false, error: result.error ?? 'Could not save your response.' };
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
      // Land on the Week grid — the legacy create surface (FAB + grid "+" + N).
      setView('week');
      return;
    }
    if (mostImminentUnrsvpd) {
      void openDrawerForEvent(mostImminentUnrsvpd);
    }
  }, [isCoach, mostImminentUnrsvpd, openDrawerForEvent]);

  // Player "Respond" only renders when there is something to respond to; on the
  // all-past demo (0 future events) it degrades to calm browse (no fake CTA).
  const primaryAction =
    isCoach || mostImminentUnrsvpd ? handlePrimaryAction : undefined;
  const primaryActionLabel = isCoach ? 'New event' : 'Respond';

  const isAgenda = view === 'agenda';
  const isDay = view === 'day';
  const dateKey = format(focusDate, 'yyyy-MM-dd');

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
        isCoach={isCoach}
        onNavigate={navigate}
        onSelectDate={(d) => setFocusDate(d)}
        onPrimaryAction={primaryAction}
        primaryActionLabel={primaryActionLabel}
      />

      {/* ── View toggle (default Agenda) ─────────────────────────────────────── */}
      <Segmented<ViewId>
        options={VIEW_OPTIONS}
        value={view}
        onValueChange={setView}
        aria-label="Calendar view"
      />

      {/* ── BODY ─────────────────────────────────────────────────────────────── */}
      {isAgenda ? (
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
        //    deliberately reuses. Keyed on `${view}:${date}` so a view switch
        //    remounts it seeded off the focused date. We do NOT touch the grid. ─
        <div className="overflow-hidden rounded-card">
          <GolfCalendarWrapper
            key={`${view}:${dateKey}`}
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
      />
    </div>
  );
}

export default FairwayCalendar;
