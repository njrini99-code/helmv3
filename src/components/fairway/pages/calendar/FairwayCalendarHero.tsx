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
  /** Whether the active lens is the agenda (wide range — label changes to "in view"). */
  isAgendaView?: boolean;
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
  isAgendaView = false,
  isCoach,
  onNavigate,
  onSelectDate,
  onPrimaryAction,
  primaryActionLabel,
}: FairwayCalendarHeroProps) {
  const monthTitle = format(focusDate, 'MMMM yyyy');
  const focusIsToday = isSameDay(focusDate, nowRef);
  // Agenda lens spans ±3 months — "this week/month" is misleading; use "in view".
  // NOTE: `windowLabel` is the noun ONLY ("week"/"month"/"in view") — the
  // sentence below prepends its own "this "/no-prefix, so a value like "this
  // week" here would render "X upcoming · Y this this week" (findings
  // #84/#106/#155/#165/#12/#80).
  const windowLabel = isAgendaView ? 'in view' : isMonthView ? 'month' : 'week';

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
              {isAgendaView ? ` ${windowLabel}` : ` this ${windowLabel}`}
            </p>
          ) : (
            <p className="font-fw-sans text-body-lg leading-[1.5] text-text-tertiary">
              No upcoming events — browse the season below
            </p>
          )}
        </div>

        {/* Action cluster — nav + the ONE primary action.
            DESKTOP (md+): byte-identical single row — unchanged.
            PHONE (<md): the four controls (2× 44px IconButton + Today + a
            primary CTA) blow the ~294px content budget at 390px in one row
            (Surface padding="lg" + page px-4), so the phone treatment is
            hand-composed, not wrapped: a centered Prev · Today · Next nav row,
            then the ONE primary action full-width on its own row in the
            thumb zone. "Today" drops to `size="sm"` on phone — a compact
            affordance, not a full chip — while Prev/Next stay `md` (44px,
            the touch-target minimum). */}
        <div className="hidden flex-shrink-0 items-center gap-2 md:flex">
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

        {/* PHONE ONLY — nav row (centered Today) + full-width primary CTA. */}
        <div className="flex flex-col gap-3 md:hidden">
          <div className="grid grid-cols-3 items-center">
            <IconButton
              variant="secondary"
              size="md"
              aria-label="Previous"
              className="justify-self-start"
              onClick={() => onNavigate('prev')}
            >
              <ChevronLeft />
            </IconButton>
            <Button
              variant={focusIsToday ? 'secondary' : 'ghost'}
              size="sm"
              className="justify-self-center"
              onClick={() => onNavigate('today')}
              aria-pressed={focusIsToday}
            >
              Today
            </Button>
            <IconButton
              variant="secondary"
              size="md"
              aria-label="Next"
              className="justify-self-end"
              onClick={() => onNavigate('next')}
            >
              <ChevronRight />
            </IconButton>
          </div>

          {onPrimaryAction ? (
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={onPrimaryAction}
              leftIcon={isCoach ? <Plus /> : undefined}
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
