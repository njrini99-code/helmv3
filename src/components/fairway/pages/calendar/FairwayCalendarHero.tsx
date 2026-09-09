'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarHero
 * ----------------------------------------------------------------------------
 * The calendar's chrome: ONE frosted champagne instrument (DESIGN-PLAN.md §5,
 * §18 "a calm daily briefing") that holds the month title, an HONEST status
 * line from real counts, Prev/Today/Next, the single primary action, the week
 * strip, and — at md+ — the view switcher and the secondary actions. On a
 * phone the secondary actions live in an anchored "More" menu so the first
 * viewport reaches the first useful event.
 *
 * HONEST status line (no fabricated numbers):
 *   - upcomingCount > 0 → "{n} upcoming · {m} this {week|month}" (tabular-nums)
 *   - upcomingCount === 0 → "No upcoming events" (NO invented count).
 *
 * ONE PRIMARY ACTION:
 *   - coach  → "New event" (a round "+" on the phone, a labelled Button at md+).
 *   - player → "Respond" on the most-imminent un-RSVP'd event; absent when
 *     there is nothing to respond to (no fake CTA).
 *
 * HYDRATION: `nowRef` is parent-owned (serverNow→nowRef). "Today" highlight uses
 * isSameDay(focusDate, nowRef), never Date.now().
 *
 * GOTCHA (a): nav arrows are Fairway IconButton / the primary is Fairway Button
 * (both native <button>s) — never `Surface as="button"`.
 * ========================================================================== */

import * as React from 'react';
import { format, isSameDay } from 'date-fns';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  ScanLine,
} from 'lucide-react';
import { Button, IconButton, PopoverPanel, Segmented } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayDayStrip } from './FairwayDayStrip';
import surfaces from './CalendarSurfaces.module.css';

export type FairwayCalendarViewId = 'day' | 'week' | 'month' | 'agenda';

export interface FairwayCalendarHeroProps {
  focusDate: Date;
  selectedDate: Date;
  /** All visible events — for the day-strip density dots. */
  events: CalendarEvent[];
  /** Parent-owned reference "now" (seeded from serverNow). */
  nowRef: Date;
  /** Total events with a start at/after serverNow (page-derived, stable). */
  upcomingCount: number;
  /** Events inside the currently visible window (this week / month). */
  windowCount: number;
  /** Whether the active lens is the month grid (affects the "this …" label). */
  isMonthView: boolean;
  /** Whether the active lens is the agenda (wide range — label changes to "in view"). */
  isAgendaView?: boolean;
  /**
   * Whether the active lens is the single Day view — labels the window
   * "today". Day view reuses the week fetch buffer internally, so without
   * its own branch it fell through to "this week" for a one-day window.
   */
  isDayView?: boolean;
  isCoach: boolean;
  /** Prev / Next / Today. */
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  /** Day-strip tap. */
  onSelectDate: (date: Date) => void;
  /**
   * Team timezone for the day-strip density dots (IANA). `null` → the
   * default team zone inside the strip.
   */
  teamTimezone?: string | null;
  /**
   * The ONE primary action. Coach → create; player → respond to the most
   * imminent un-RSVP'd event. `undefined` renders no CTA (demo / nothing to do).
   */
  onPrimaryAction?: () => void;
  /** Override the CTA label (defaults: coach "New event", player "Respond"). */
  primaryActionLabel?: string;
  /** View switcher — rendered inside the chrome at every width. */
  view?: FairwayCalendarViewId;
  viewOptions?: ReadonlyArray<{ value: FairwayCalendarViewId; label: string }>;
  onViewChange?: (view: FairwayCalendarViewId) => void;
  /** Secondary actions. Each is omitted from the UI when absent. */
  onFindTime?: () => void;
  onConflicts?: () => void;
  onSubscribe?: () => void;
  onAvailability?: () => void;
  /** Real count of open conflicts (badge on the Conflicts action). `null` = unknown. */
  conflictCount?: number | null;
}

export function FairwayCalendarHero({
  focusDate,
  selectedDate,
  events,
  nowRef,
  upcomingCount,
  windowCount,
  isMonthView,
  isAgendaView = false,
  isDayView = false,
  isCoach,
  onNavigate,
  onSelectDate,
  onPrimaryAction,
  primaryActionLabel,
  teamTimezone = null,
  view,
  viewOptions,
  onViewChange,
  onFindTime,
  onConflicts,
  onSubscribe,
  onAvailability,
  conflictCount = null,
}: FairwayCalendarHeroProps) {
  const monthTitle = format(focusDate, 'MMMM yyyy');
  const focusIsToday = isSameDay(focusDate, nowRef);
  // Agenda lens spans ±3 months — "this week/month" is misleading; use "in view".
  // Each lens owns its OWN full phrase (not a noun the sentence re-prefixes
  // with "this ") so there is no seam where a second "this" can sneak in and
  // no fallthrough where an un-handled lens silently inherits another lens's
  // wording. Day view reuses the week fetch buffer internally — that
  // implementation detail must never leak into this label.
  const windowLabel = isAgendaView
    ? 'in view'
    : isMonthView
      ? 'this month'
      : isDayView
        ? 'today'
        : 'this week';

  const ctaLabel = primaryActionLabel ?? (isCoach ? 'New event' : 'Respond');
  const hasViews = Boolean(view && viewOptions && onViewChange);
  const conflictsLabel =
    conflictCount && conflictCount > 0 ? `Conflicts (${conflictCount})` : 'Conflicts';
  const [moreOpen, setMoreOpen] = React.useState(false);
  const secondaryActions = [
    onFindTime && isCoach
      ? { key: 'find', label: 'Find a time', icon: <ScanLine className="h-4 w-4" aria-hidden />, run: onFindTime }
      : null,
    onConflicts
      ? { key: 'conflicts', label: conflictsLabel, icon: <AlertTriangle className="h-4 w-4" aria-hidden />, run: onConflicts }
      : null,
    onAvailability
      ? { key: 'availability', label: 'My availability', icon: <CalendarClock className="h-4 w-4" aria-hidden />, run: onAvailability }
      : null,
    onSubscribe
      ? { key: 'subscribe', label: 'Add to phone', icon: <CalendarPlus className="h-4 w-4" aria-hidden />, run: onSubscribe }
      : null,
  ].filter((action): action is NonNullable<typeof action> => action !== null);

  return (
    <section
      aria-label="Calendar controls"
      className={cn(
        // Sticky chrome: the agenda, rail and grids scroll UNDER this glass.
        // Sits just below the top bar + hub sub-nav (AppShell publishes both
        // offsets) and beneath the sub-nav's z-raised.
        'sticky top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))] z-[9] overflow-hidden rounded-fw-lg border px-3 pb-2.5 pt-3 md:p-4',
        surfaces.chrome,
        surfaces.enter,
      )}
    >
      {/* A quiet emerald breath at the top-right so the glass has light to refract. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-accent-500/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center md:gap-4">
        {/* Title column — month + honest status line. `md:min-w-[260px]` gives
            the row something to wrap AROUND at tablet widths so the control
            cluster drops to its own line instead of squeezing the title. */}
        <div className="flex min-w-0 flex-col gap-0.5 md:min-w-[260px]">
          <h1 className="font-fw-display text-[1.5rem] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary md:text-h2 [text-wrap:balance]">
            {monthTitle}
          </h1>
          {upcomingCount > 0 ? (
            <p className="whitespace-nowrap font-fw-sans text-caption leading-[1.4] text-text-secondary">
              <span className="font-fw-mono tabular-nums">{upcomingCount}</span>
              {' upcoming · '}
              <span className="font-fw-mono tabular-nums">{windowCount}</span>
              {` ${windowLabel}`}
            </p>
          ) : (
            <p className="font-fw-sans text-caption leading-[1.4] text-text-tertiary">
              No upcoming events
            </p>
          )}
        </div>

        {/* Control cluster — nav, the ONE primary action, and (phone) the
            anchored More menu. Flush right at md+ whether it shares the title
            row or wraps below it. */}
        <div className="flex flex-shrink-0 items-center gap-1.5 md:ml-auto md:flex md:gap-2">
          <IconButton
            variant="secondary"
            size="md"
            aria-label="Previous"
            onClick={() => onNavigate('prev')}
            className={surfaces.press}
          >
            <ChevronLeft />
          </IconButton>
          <Button
            variant={focusIsToday ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onNavigate('today')}
            aria-pressed={focusIsToday}
            className={surfaces.press}
          >
            Today
          </Button>
          <IconButton
            variant="secondary"
            size="md"
            aria-label="Next"
            onClick={() => onNavigate('next')}
            className={surfaces.press}
          >
            <ChevronRight />
          </IconButton>

          <span className="flex-1 md:hidden" />

          {secondaryActions.length > 0 ? (
            <PopoverPanel
              open={moreOpen}
              onOpenChange={setMoreOpen}
              side="bottom"
              align="end"
              width="sm"
              ariaLabel="More calendar actions"
              trigger={
                <IconButton
                  variant="secondary"
                  size="md"
                  aria-label="More calendar actions"
                  className={cn('md:hidden', surfaces.press)}
                >
                  <MoreHorizontal />
                </IconButton>
              }
            >
              {secondaryActions.map((action) => (
                <PopoverPanel.Item
                  key={action.key}
                  onClick={() => {
                    setMoreOpen(false);
                    action.run();
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-text-tertiary">{action.icon}</span>
                    {action.label}
                  </span>
                </PopoverPanel.Item>
              ))}
            </PopoverPanel>
          ) : null}

          {onPrimaryAction ? (
            <>
              {/* Phone: a round "+" for coaches (one primary action, no wide
                  band); players keep the labelled "Respond" chip. */}
              {isCoach ? (
                <IconButton
                  variant="primary"
                  size="md"
                  aria-label={ctaLabel}
                  onClick={onPrimaryAction}
                  className={cn('md:hidden', surfaces.selected, surfaces.press)}
                >
                  <Plus />
                </IconButton>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onPrimaryAction}
                  className={cn('md:hidden', surfaces.selected, surfaces.press)}
                >
                  {ctaLabel}
                </Button>
              )}
              <Button
                variant="primary"
                size="md"
                onClick={onPrimaryAction}
                leftIcon={isCoach ? <Plus /> : undefined}
                className={cn('ml-1 hidden md:inline-flex', surfaces.selected, surfaces.press)}
              >
                {ctaLabel}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Week strip — the second row of the instrument. On a phone the month
          grid already shows every day, so the strip steps aside there. */}
      <div className={cn('relative mt-3', isMonthView && 'max-md:hidden')}>
        <FairwayDayStrip
          focusDate={focusDate}
          selectedDate={selectedDate}
          events={events}
          nowRef={nowRef}
          teamTimezone={teamTimezone}
          onSelectDate={onSelectDate}
          onSwipe={(direction) => onNavigate(direction)}
        />
      </div>

      {/* Third row — the view switcher (every width) and, at md+, the
          secondary actions as quiet labelled pills. */}
      {hasViews || secondaryActions.length > 0 ? (
        <div className="relative mt-3 flex items-center gap-2">
          {hasViews ? (
            <div className="min-w-0 flex-1 md:flex-none">
              <Segmented<FairwayCalendarViewId>
                options={viewOptions!}
                value={view!}
                onValueChange={onViewChange!}
                size="sm"
                fullWidth
                aria-label="Calendar view"
                className="md:w-auto"
              />
            </div>
          ) : null}
          {secondaryActions.length > 0 ? (
            <div className="hidden flex-wrap items-center gap-1.5 md:ml-auto md:flex">
              {secondaryActions.map((action) => (
                <Button
                  key={action.key}
                  variant="ghost"
                  size="sm"
                  leftIcon={action.icon}
                  onClick={action.run}
                  className={cn('rounded-full', surfaces.press)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
