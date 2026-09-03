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
  /**
   * Whether the active lens is the single-day view. Falling through to the
   * `week` label here (as this used to) mislabels a one-day window as
   * "this week" — a fixed-window fetch buffer leaking into user-facing copy.
   */
  isDayView?: boolean;
  isCoach: boolean;
  /** Prev / Today / Next. */
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  /** Day-strip selection. */
  onSelectDate: (date: Date) => void;
  /** Team timezone — threaded straight through to FairwayDayStrip's
   *  timezone-aware density-dot bucketing (see that file's header note).
   *  Optional (defaults to `null`, which `getZonedDateParts` treats as
   *  DEFAULT_TIMEZONE) so existing callers/tests need no changes. */
  teamTimezone?: string | null;
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
  isDayView = false,
  isCoach,
  onNavigate,
  onSelectDate,
  onPrimaryAction,
  primaryActionLabel,
  teamTimezone = null,
}: FairwayCalendarHeroProps) {
  const monthTitle = format(focusDate, 'MMMM yyyy');
  const focusIsToday = isSameDay(focusDate, nowRef);
  // Agenda lens spans ±3 months — "this week/month" is misleading; use "in view".
  // Each lens owns its OWN full phrase (not a noun the sentence re-prefixes
  // with "this ") so there is no seam where a second "this" can sneak in
  // (findings #84/#106/#155/#165/#12/#80) and no fallthrough where an
  // un-handled lens silently inherits another lens's wording. Day view
  // previously had no branch here at all and fell through to "week"
  // (mislabeling a single-day window as "this week") because the fetch
  // buffer for Day reuses the week range internally — that internal
  // implementation detail must never leak into this label.
  const windowLabel = isAgendaView
    ? 'in view'
    : isMonthView
      ? 'this month'
      : isDayView
        ? 'today'
        : 'this week';

  return (
    // The ONE hero plinth — a warm matte Surface (bg-surface), shadow elevation
    // (border OR shadow, never both), generous hero padding.
    <Surface elevation="shadow" padding="lg" className="bg-surface">
      <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-6">
        {/* Title column — eyebrow + month + honest status line.
            md:min-w-[260px]: at tablet widths (810/844px — between md and lg)
            the nav+CTA cluster is flex-shrink-0, so ALL the deficit used to
            land on this column; with no floor it could shrink toward zero and
            the status line wrapped word-by-word ("1 / upcoming / · 12 in /
            view" — GAPS_AUDIT_TABLET_LANDSCAPE #5). The floor plus md:flex-wrap
            on the row above means the cluster drops to its own line instead of
            squeezing this one once there isn't room for both. */}
        <div className="flex min-w-0 flex-col gap-2 md:min-w-[260px]">
          <p className="inline-flex items-center gap-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-accent-700">
            <span aria-hidden className="h-1 w-1 rounded-full bg-accent-500" />
            Calendar
          </p>

          <h1 className="font-fw-display text-h1 font-medium leading-[1.05] tracking-[-0.008em] text-text-primary [text-wrap:balance]">
            {monthTitle}
          </h1>

          {/* HONEST status line — real counts, never fabricated.
              whitespace-nowrap: this is ONE phrase ("N upcoming · M this
              week") — it must wrap as a whole line (or not at all, given the
              min-width above), never split mid-phrase across 3-4 lines. */}
          {upcomingCount > 0 ? (
            <p className="whitespace-nowrap font-fw-sans text-body-lg leading-[1.5] text-text-secondary">
              <span className="font-fw-mono tabular-nums">{upcomingCount}</span>
              {' upcoming · '}
              <span className="font-fw-mono tabular-nums">{windowCount}</span>
              {` ${windowLabel}`}
            </p>
          ) : (
            <p className="font-fw-sans text-body-lg leading-[1.5] text-text-tertiary">
              No upcoming events — browse the season below
            </p>
          )}
        </div>

        {/* Action cluster — nav + the ONE primary action.
            DESKTOP (lg+ / any md+ width with room): same single row as
            before. TABLET (md, tight width): md:flex-wrap on the row above
            drops this cluster onto its own line below the title column
            instead of squeezing it; md:ml-auto keeps it flush right in
            EITHER case (identical to the old md:justify-between placement
            when there's one row, right-aligned on its own line when there
            are two).
            PHONE (<md): the four controls (2× 44px IconButton + Today + a
            primary CTA) blow the ~294px content budget at 390px in one row
            (Surface padding="lg" + page px-4), so the phone treatment is
            hand-composed, not wrapped: a centered Prev · Today · Next nav row,
            then the ONE primary action full-width on its own row in the
            thumb zone. "Today" drops to `size="sm"` on phone — a compact
            affordance, not a full chip — while Prev/Next stay `md` (44px,
            the touch-target minimum). */}
        <div className="hidden flex-shrink-0 items-center gap-2 md:ml-auto md:flex">
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
          teamTimezone={teamTimezone}
          onSelectDate={onSelectDate}
        />
      </div>
    </Surface>
  );
}
