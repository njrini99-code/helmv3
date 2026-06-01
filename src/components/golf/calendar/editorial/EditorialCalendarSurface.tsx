'use client';

/**
 * EditorialCalendarSurface — the top-level Calendar shell.
 *
 * Owns:
 *   - Editorial hero plinth (eyebrow + animated month title + subtitle)
 *   - Prev / Today / Next nav row with arrow-key + T-key shortcuts
 *   - DayStrip (week-of-7 pills, density dots, click-to-focus)
 *   - View toggle (GolfTabBar — Day / Week / Month / Agenda)
 *   - AgendaView (when view === 'agenda') with vaul-backed detail drawer
 *   - GolfCalendarWrapper (when view === 'day' | 'week' | 'month') for the
 *     existing grid renderers, RSVP plumbing, DnD, and create/edit modals.
 *
 * Doesn't touch:
 *   - Event-fetching server actions (parent server component owns that)
 *   - Recurring-event flows, drag-and-drop, multi-player availability, FAB
 *     (all live inside GolfCalendarWrapper / PremiumCalendarClient)
 *   - The vaul drawer for calendar feeds (still inside GolfCalendarWrapper)
 *
 * The whole experience animates on cubic-bezier(0.16, 1, 0.3, 1) with
 * AnimatePresence cross-fades between view bodies and a 4px directional
 * slide on month nav.
 */

import * as React from 'react';
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
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { Reveal } from '@/components/ui/reveal';
import { GolfTabBar, type GolfTabBarItem } from '@/components/golf/GolfTabBar';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import { GolfCalendarWrapper } from '@/components/golf/calendar/GolfCalendarWrapper';
import { DayStrip } from './DayStrip';
import { AgendaView } from './AgendaView';
import { EventDetailDrawer } from './EventDetailDrawer';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { TeamMember } from '@/components/golf/calendar/PremiumCalendarClient';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { Button, IconButton } from '@/components/ui/button';

type ViewId = 'day' | 'week' | 'month' | 'agenda';

const PREMIUM_EASE = [0.16, 1, 0.3, 1] as const;

interface EditorialCalendarSurfaceProps {
  events: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach: boolean;
  teamTimezone: string | null;
  upcomingCount: number;
  /**
   * ISO timestamp captured on the server when the page rendered. Used to seed
   * the initial focus date so the first server and client renders agree.
   * After mount we rehydrate to the client's actual `new Date()`.
   */
  serverNow: string;
}

/** Local midnight of the day represented by the given Date. */
function toLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function EditorialCalendarSurface({
  events,
  teamMembers,
  isCoach,
  teamTimezone,
  upcomingCount,
  serverNow,
}: EditorialCalendarSurfaceProps) {
  const prefersReducedMotion = useReducedMotion();

  // Anchor for the visible week / focused day.
  //
  // We seed BOTH server and first-client renders from `serverNow` so the
  // initial markup matches byte-for-byte (no hydration mismatch). After
  // mount, an effect bumps `nowRef` to the client's actual current time and
  // — if the user has crossed into a different local day since the server
  // rendered — promotes `focusDate` accordingly. This is the same pattern
  // PlayerHub uses (deferred `now` state) but extended to drive `focusDate`
  // too because the calendar's hero title, day strip, and "today" plinth
  // are all derived from it.
  const initialFocus = React.useMemo(() => toLocalMidnight(new Date(serverNow)), [serverNow]);
  const [focusDate, setFocusDate] = React.useState<Date>(initialFocus);
  const [nowRef, setNowRef] = React.useState<Date>(initialFocus);

  // After mount — replace the server-seeded `nowRef` with the client's real
  // `new Date()`. If the local day changed (e.g. user opened a stale tab or
  // is in a different timezone than the server) bump focusDate forward too.
  React.useEffect(() => {
    const clientNow = toLocalMidnight(new Date());
    setNowRef(clientNow);
    setFocusDate((prev) => {
      // Only nudge focus to the new "today" if the user is still parked on
      // the server-seeded date. If they've already navigated, leave them.
      if (prev.getTime() === initialFocus.getTime() && clientNow.getTime() !== initialFocus.getTime()) {
        return clientNow;
      }
      return prev;
    });
  }, [initialFocus]);

  // Default to Week per brief. Persists across nav.
  const [view, setView] = React.useState<ViewId>('week');

  // Direction of the latest nav action — drives the month-title slide.
  const [navDirection, setNavDirection] = React.useState<1 | -1>(1);

  // Drawer state for Agenda mode (Day/Week/Month grids open the modal via
  // the existing PremiumCalendarClient → EventDetailModal pipeline).
  const [drawerEvent, setDrawerEvent] = React.useState<CalendarEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Player RSVP map — populated when the player opens the drawer for an
  // event we haven't seen yet. Lives at the surface level so subsequent
  // opens of the same event remember the response.
  const [userRsvpStatuses, setUserRsvpStatuses] = React.useState<Map<string, RSVPStatus>>(new Map());

  // Coach RSVP summary for the current drawer event.
  const [drawerRsvpSummary, setDrawerRsvpSummary] = React.useState<{
    accepted: number;
    declined: number;
    tentative: number;
    pending: number;
    total: number;
  } | null>(null);

  // Visible window varies with view — used by both DayStrip and AgendaView.
  const visibleWindow = React.useMemo(() => {
    if (view === 'month') {
      return {
        start: startOfMonth(focusDate),
        end: endOfMonth(focusDate),
      };
    }
    if (view === 'agenda') {
      // Agenda gets a wider window — current week back, 30 days forward.
      return {
        start: startOfWeekFn(focusDate, { weekStartsOn: 0 }),
        end: addDays(focusDate, 30),
      };
    }
    return {
      start: startOfWeekFn(focusDate, { weekStartsOn: 0 }),
      end: endOfWeekFn(focusDate, { weekStartsOn: 0 }),
    };
  }, [focusDate, view]);

  // Hero subtitle — count of events in the visible window, plus total upcoming.
  const eventsInWindow = React.useMemo(() => {
    const startMs = visibleWindow.start.getTime();
    const endMs = visibleWindow.end.getTime() + 24 * 60 * 60 * 1000 - 1;
    return events.filter((e) => {
      const s = e.start_time || e.start_date;
      if (!s) return false;
      const t = new Date(s).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [events, visibleWindow]);

  // Editorial hero title — month name of the focused date. Year shows in the
  // subtitle. The key changes every month so AnimatePresence cross-fades.
  const heroMonthKey = format(focusDate, 'yyyy-MM');
  const heroPretty = `${format(focusDate, 'MMMM')} events.`;

  // ---- Navigation ----
  const navigate = React.useCallback((direction: 'prev' | 'next' | 'today') => {
    void triggerHaptic('light');
    if (direction === 'today') {
      // Always read the live wall clock here — `nowRef` is only frozen for
      // the initial hydration pass.
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      setNavDirection(today.getTime() >= focusDate.getTime() ? 1 : -1);
      setFocusDate(today);
      return;
    }

    const dir = direction === 'next' ? 1 : -1;
    setNavDirection(dir);

    // Step size scales with view — feels right for each lens.
    if (view === 'agenda' || view === 'week' || view === 'day') {
      // Move by a week so the day-strip "turns the page". Day view is also
      // weekly here because DayStrip is the primary date selector.
      setFocusDate((d) => addDays(d, dir * 7));
    } else {
      setFocusDate((d) => addMonths(d, dir));
    }
  }, [view, focusDate]);

  // Keyboard shortcuts — Arrow Left/Right + T. Only when no input is focused
  // and no modal/drawer is open (drawerOpen check is enough — the legacy
  // PremiumCalendarClient owns its own modal-keyboard contract).
  React.useEffect(() => {
    if (drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
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

  // ---- Drawer plumbing ----
  const openDrawerForEvent = React.useCallback(async (event: CalendarEvent) => {
    setDrawerEvent(event);
    setDrawerOpen(true);
    setDrawerRsvpSummary(null);

    // Fetch context data lazily so the chip click feels instant.
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
        // Drawer still works without the summary — just show description/loc.
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
  }, [isCoach, userRsvpStatuses]);

  const handleRespond = React.useCallback(async (eventId: string, status: RSVPStatus) => {
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
  }, []);

  // ---- View toggle ----
  const tabs: GolfTabBarItem<ViewId>[] = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'agenda', label: 'Agenda' },
  ];

  // ---- Render ----
  const showHeroAndStrip = true;
  const isAgenda = view === 'agenda';

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* ============ HERO PLINTH ============ */}
      {showHeroAndStrip && (
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-6">
              <div className="flex flex-col gap-3">
                {/* Eyebrow with brand-kelly accent dot. */}
                <p className="font-serif text-eyebrow uppercase tracking-[0.16em] text-warm-500 inline-flex items-center gap-2">
                  <span aria-hidden className="h-1 w-1 rounded-full bg-primary-500" />
                  Calendar
                </p>

                {/* Animated month title — fades + slides on nav. */}
                <h1 className="font-display text-h1 sm:text-display font-medium leading-[1.05] tracking-[-0.022em] text-warm-900 max-w-[28ch]">
                  <AnimatePresence mode="wait" initial={false}>
                    <m.span
                      key={heroMonthKey}
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 6, x: navDirection * 4 }}
                      animate={{ opacity: 1, y: 0, x: 0 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4, x: navDirection * -4 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.32, ease: PREMIUM_EASE }}
                      className="inline-block"
                    >
                      {heroPretty}
                    </m.span>
                  </AnimatePresence>
                </h1>

                <p className="text-body sm:text-body-lg leading-[1.55] text-warm-500 max-w-[52ch]">
                  {events.length === 0
                    ? 'Practice, tournaments, qualifiers — once events are scheduled they show up here.'
                    : `${eventsInWindow.length} event${eventsInWindow.length === 1 ? '' : 's'} this ${view === 'month' ? 'month' : 'week'} · ${upcomingCount} upcoming.`}
                </p>
              </div>

              {/* Nav cluster — Prev / Today / Next on the right rail at md+. */}
              <div className="flex items-center gap-1.5 md:flex-shrink-0">
                <IconButton variant="default"
                  type="button"
                  onClick={() => navigate('prev')}
                  aria-label="Previous"
                  className={cn(
                    'inline-flex items-center justify-center rounded-full',
                    'w-10 h-10 md:w-9 md:h-9',
                    'text-warm-500 hover:text-warm-900 hover:bg-cream-50/65',
                    'transition-colors duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  )}
                >
                  <IconChevronLeft size={16} />
                </IconButton>
                <Button variant="primary"
                  type="button"
                  onClick={() => navigate('today')}
                  className={cn(
                    'inline-flex items-center justify-center rounded-full px-4 h-10 md:h-9',
                    'text-[12.5px] font-medium tracking-[-0.005em]',
                    // Use `nowRef` instead of date-fns `isToday` (which calls
                    // `Date.now()` internally) so server + first-client agree.
                    isSameDay(focusDate, nowRef)
                      ? 'bg-primary-50/85 text-primary-700 ring-1 ring-primary-500/20'
                      : 'text-warm-700 hover:text-warm-900 bg-cream-50/65 hover:bg-cream-50/95 ring-1 ring-warm-200/55',
                    'transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  )}
                >
                  Today
                </Button>
                <IconButton variant="default"
                  type="button"
                  onClick={() => navigate('next')}
                  aria-label="Next"
                  className={cn(
                    'inline-flex items-center justify-center rounded-full',
                    'w-10 h-10 md:w-9 md:h-9',
                    'text-warm-500 hover:text-warm-900 hover:bg-cream-50/65',
                    'transition-colors duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  )}
                >
                  <IconChevronRight size={16} />
                </IconButton>
              </div>
            </div>

            {/* Day strip — sits inside the plinth, anchored beneath the title. */}
            <div className="mt-6 md:mt-8">
              <DayStrip
                focusDate={focusDate}
                selectedDate={focusDate}
                events={events}
                nowRef={nowRef}
                onSelectDate={(d) => {
                  // Tapping a different week's day shifts the strip + plinth.
                  setNavDirection(d.getTime() > focusDate.getTime() ? 1 : -1);
                  setFocusDate(d);
                }}
              />
            </div>
          </div>
        </Reveal>
      )}

      {/* ============ VIEW TOGGLE ============ */}
      <Reveal staggerIndex={1}>
        <div className="px-1">
          <GolfTabBar<ViewId>
            tabs={tabs}
            value={view}
            onChange={(v) => {
              void triggerHaptic('light');
              setView(v);
            }}
            ariaLabel="Calendar view"
            scrollable
          />
        </div>
      </Reveal>

      {/* ============ BODY ============ */}
      <div className="relative min-h-[400px]">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={view}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.28, ease: PREMIUM_EASE }}
          >
            {isAgenda ? (
              <AgendaView
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
            ) : view === 'day' ? (
              // Day view — show focused day's agenda above the legacy day grid
              // for the deeper info (drag-and-drop time slots, multi-player
              // availability overlays, etc.). Most users will satisfy with the
              // agenda alone but power users get the grid one tap below.
              <div className="space-y-6">
                <AgendaView
                  events={events}
                  mode="day"
                  focusDate={focusDate}
                  isCoach={isCoach}
                  userRsvpStatuses={userRsvpStatuses}
                  onEventClick={openDrawerForEvent}
                  nowRef={nowRef}
                />
              </div>
            ) : (
              // Week / Month → existing PremiumCalendarClient grid renders.
              // We hand it the focusDate via initialEvents + teamMembers; the
              // legacy header offers its own nav, but our editorial nav at the
              // top is the primary control. Both can coexist without conflict
              // (each calls setCurrentDate on its own state machine).
              <div className="rounded-3xl overflow-hidden">
                <LegacyGridShell
                  events={events}
                  teamMembers={teamMembers}
                  isCoach={isCoach}
                  teamTimezone={teamTimezone}
                  initialView={view as 'week' | 'month'}
                  initialDate={focusDate}
                />
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </div>

      {/* ============ DETAIL DRAWER ============ */}
      <EventDetailDrawer
        event={drawerEvent}
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) {
            // Clear lazily so the drawer's exit animation finishes.
            setTimeout(() => setDrawerEvent(null), 220);
          }
        }}
        isCoach={isCoach}
        rsvpStatus={drawerEvent ? userRsvpStatuses.get(drawerEvent.id) ?? null : null}
        rsvpSummary={drawerRsvpSummary}
        onRespond={!isCoach ? handleRespond : undefined}
        // Coach edit hook left undefined for now — the existing edit flow is
        // the modal inside PremiumCalendarClient, which the chip click in the
        // grid views still hits directly. Wiring an "Edit details" handoff
        // would require lifting selectedEvent state up; out of scope for the
        // editorial pass.
      />
    </div>
  );
}

/**
 * Thin wrapper around GolfCalendarWrapper that mirrors our editorial
 * focusDate / view into its initial state. We don't try to keep them in sync
 * after mount — the legacy grid has its own header with prev/next inside —
 * which means swapping views in the editorial bar resets the grid to the
 * focused date the user picked. That's the right behavior for Calendar:
 * users expect "switch to month → land on the month containing the day I
 * tapped".
 *
 * The component is keyed on `${view}:${date}` so view changes force a
 * remount, which lets the inner state initialize off the new focus.
 */
function LegacyGridShell({
  events,
  teamMembers,
  isCoach,
  teamTimezone,
  initialView,
  initialDate,
}: {
  events: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach: boolean;
  teamTimezone: string | null;
  initialView: 'week' | 'month';
  initialDate: Date;
}) {
  // Key on view+date so view changes force a fresh mount with the right
  // initial state (PremiumCalendarClient seeds its inner state from these
  // props once at mount, not on every change).
  const dateKey = format(initialDate, 'yyyy-MM-dd');
  return (
    <GolfCalendarWrapper
      key={`${initialView}:${dateKey}`}
      initialEvents={events}
      teamMembers={teamMembers}
      isCoach={isCoach}
      teamTimezone={teamTimezone}
      initialView={initialView}
      initialDate={initialDate}
    />
  );
}

