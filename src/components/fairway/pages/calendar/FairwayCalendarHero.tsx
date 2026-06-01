'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarHero
 * ----------------------------------------------------------------------------
 * The ONE focal hero: a warm Fairway calendar plinth (Surface, bg-surface — NOT
 * bg-white). Holds the eyebrow ("Calendar"), the month title (font-fw-display,
 * replacing the legacy font-serif), an HONEST status line from real counts, the
 * Prev/Today/Next nav cluster, the single primary action, and the day strip.
 *
 * HONEST status line (no fabricated numbers):
 *   - upcomingCount > 0 → "{n} upcoming · {m} this {week|month}" (tabular-nums)
 *   - upcomingCount === 0 (the DEMO, all-past) → a dim text-text-tertiary line
 *     "No upcoming events — browse the season below" (NO invented count).
 *
 * ONE PRIMARY ACTION:
 *   - coach  → "New event" (accent Button) — wires the legacy create flow
 *     (handed in as `onPrimaryAction` from the orchestrator).
 *   - player → "Respond" on the most-imminent un-RSVP'd event; on the demo
 *     (0 future events) it degrades to a calm absence (no fake CTA).
 *
 * HYDRATION: `nowRef` is parent-owned (serverNow→nowRef). "Today" highlight uses
 * isSameDay(focusDate, nowRef), never Date.now().
 *
 * GOTCHA (a): nav arrows are Fairway IconButton / the primary is Fairway Button
 * (both native <button>s) — never `Surface as="button"`.
 * ========================================================================== */

import { format, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Surface, Button, IconButton } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayDayStrip } from './FairwayDayStrip';

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
  isCoach: boolean;
  /** Prev / Today / Next. */
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  /** Day-strip selection. */
  onSelectDate: (date: Date) => void;
  /**
   * The single primary action. Coach → fires the legacy create flow; player →
   * opens the most-imminent un-RSVP'd event's drawer. Undefined (e.g. player on
   * the all-past demo) renders NO CTA — an honest calm absence.
   */
  onPrimaryAction?: () => void;
  /** Primary action label ("New event" coach / "Respond" player). */
  primaryActionLabel?: string;
}

export function FairwayCalendarHero({
  focusDate,
  selectedDate,
  events,
  nowRef,
  upcomingCount,
  windowCount,
  isMonthView,
  isCoach,
  onNavigate,
  onSelectDate,
  onPrimaryAction,
  primaryActionLabel,
}: FairwayCalendarHeroProps) {
  const monthTitle = format(focusDate, 'MMMM yyyy');
  const focusIsToday = isSameDay(focusDate, nowRef);
  const windowLabel = isMonthView ? 'month' : 'week';

  return (
    // The ONE hero plinth — a warm matte Surface (bg-surface), shadow elevation
    // (border OR shadow, never both), generous hero padding.
    <Surface elevation="shadow" padding="lg" className="bg-surface">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-6">
        {/* Title column — eyebrow + month + honest status line. */}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="inline-flex items-center gap-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-accent-700">
            <span aria-hidden className="h-1 w-1 rounded-full bg-accent-500" />
            Calendar
          </p>

          <h1 className="font-fw-display text-h1 font-medium leading-[1.05] tracking-[-0.008em] text-text-primary [text-wrap:balance]">
            {monthTitle}
          </h1>

          {/* HONEST status line — real counts, never fabricated. */}
          {upcomingCount > 0 ? (
            <p className="font-fw-sans text-body-lg leading-[1.5] text-text-secondary">
              <span className="font-fw-mono tabular-nums">{upcomingCount}</span>
              {' upcoming · '}
              <span className="font-fw-mono tabular-nums">{windowCount}</span>
              {` this ${windowLabel}`}
            </p>
          ) : (
            <p className="font-fw-sans text-body-lg leading-[1.5] text-text-tertiary">
              No upcoming events — browse the season below
            </p>
          )}
        </div>

        {/* Action cluster — nav + the ONE primary action. */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <IconButton
            variant="secondary"
            size="md"
            aria-label="Previous"
            onClick={() => onNavigate('prev')}
          >
            <ChevronLeft />
          </IconButton>
          <Button
            variant={focusIsToday ? 'secondary' : 'ghost'}
            size="md"
            onClick={() => onNavigate('today')}
            aria-pressed={focusIsToday}
          >
            Today
          </Button>
          <IconButton
            variant="secondary"
            size="md"
            aria-label="Next"
            onClick={() => onNavigate('next')}
          >
            <ChevronRight />
          </IconButton>

          {onPrimaryAction ? (
            <Button
              variant="primary"
              size="md"
              onClick={onPrimaryAction}
              leftIcon={isCoach ? <Plus /> : undefined}
              className="ml-1"
            >
              {primaryActionLabel ?? (isCoach ? 'New event' : 'Respond')}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Day strip — sits inside the plinth, beneath the title. */}
      <div className="mt-6 md:mt-8">
        <FairwayDayStrip
          focusDate={focusDate}
          selectedDate={selectedDate}
          events={events}
          nowRef={nowRef}
          onSelectDate={onSelectDate}
        />
      </div>
    </Surface>
  );
}

export default FairwayCalendarHero;
