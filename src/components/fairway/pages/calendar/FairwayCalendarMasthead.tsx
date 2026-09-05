'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarMasthead (S1 — chrome collapse)
 * ----------------------------------------------------------------------------
 * REPLACES `FairwayCalendarHero`. The hero was a `Surface padding="lg"` plinth
 * that stacked an eyebrow, a 32px month title, a counts line, a prev/Today/next
 * row, a full-width "New event" button AND the day strip — five rows of chrome
 * before the view toggle even started. Measured at 390x844 the first real event
 * sat off screen (mobile-calendar-rebuild-brief §1).
 *
 * What this is instead: ONE header band, two rows total.
 *
 *   row 1  month + year as the PAGE TITLE (the "Calendar" eyebrow is gone —
 *          the Calendar bottom-nav tab and the calendar sub-tab strip both
 *          already say it) with a picker chevron, and a single overflow
 *          control on the right holding everything that is not everyday.
 *   row 2  the day strip, which IS the week navigation now — swipe, or the
 *          page-level arrow keys FairwayCalendar already binds. The
 *          prev/Today/next cluster is retired; "Jump to today" lives in the
 *          month picker, which is where someone who has navigated away
 *          actually looks for it.
 *
 * MATERIAL (brief §2, which the previous design pass got wrong):
 *   - the band is `bg-elevated` with a hairline BOTTOM border only. It is a
 *     header plane, not a card, so it never takes `rounded-card` and never
 *     pairs a border with `shadow-soft` (surface.tsx: "the cheap-UI tell").
 *   - `bg-elevated` rather than bare canvas is deliberate. The day-strip track
 *     is `bg-surface-sunken`, and FairwayAgendaView's own note records that
 *     sunken RECEDES BELOW canvas in the dark scope — a well only reads as a
 *     well nested inside something lighter. Sitting the track on a lighter
 *     plane is what keeps it legible in both themes (dark: elevated L=0.248
 *     vs sunken L=0.208; light: 0.993 vs 0.963 — design-tokens.css).
 *   - the sunken shadow is `SEGMENTED_TRACK_SUNKEN_SHADOW`, the SAME string
 *     `Segmented` uses for its own well. One recipe, one place to change it.
 *
 * HYDRATION: `focusDate` / `nowRef` are parent-owned (seeded from `serverNow`
 * via `zonedMidnight`). Nothing here calls `Date.now()` or date-fns `isToday()`
 * — that races the server clock and trips React #418.
 * ========================================================================== */

import * as React from 'react';
import { addMonths, format, isSameMonth, setMonth, setYear, startOfMonth } from 'date-fns';
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Button,
  IconButton,
  SelectablePill,
  SEGMENTED_TRACK_SUNKEN_SHADOW,
} from '@/components/fairway/controls';
import { Sheet } from '@/components/fairway/overlays';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayDayStrip } from './FairwayDayStrip';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface FairwayCalendarMastheadProps {
  /** Anchor date — drives the title and the week the strip frames. */
  focusDate: Date;
  /** The selected day (drives the body below). */
  selectedDate: Date;
  /** All visible events — for the day-strip density dots. */
  events: CalendarEvent[];
  /** Parent-owned reference "now" (seeded from `serverNow`). */
  nowRef: Date;
  /** Team timezone — threaded to the strip's density-dot bucketing. */
  teamTimezone?: string | null;
  /** Week paging + "today". The strip's swipe and the picker both call this. */
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  /** Day-strip selection / month-picker jump. */
  onSelectDate: (date: Date) => void;
  /**
   * Overflow: "Add to phone" (ICS feeds). Lower-priority per AGENTS.md's
   * "move lower-priority actions into overflow or a bottom sheet" — it used to
   * hold a permanent second row under the view toggle.
   */
  onSubscribe: () => void;
}

export function FairwayCalendarMasthead({
  focusDate,
  selectedDate,
  events,
  nowRef,
  teamTimezone = null,
  onNavigate,
  onSelectDate,
  onSubscribe,
}: FairwayCalendarMastheadProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [overflowOpen, setOverflowOpen] = React.useState(false);
  // The year the picker grid shows — seeded from `focusDate`, stepped by its
  // own arrows, and RE-seeded every time the sheet opens so it never reopens
  // on a year the user has since navigated away from.
  const [pickerYear, setPickerYear] = React.useState(() => focusDate.getFullYear());

  const openPicker = React.useCallback(() => {
    setPickerYear(focusDate.getFullYear());
    setPickerOpen(true);
  }, [focusDate]);

  const monthName = format(focusDate, 'MMMM');
  const yearLabel = format(focusDate, 'yyyy');

  return (
    // Full-bleed header PLANE inside the page's px-4/px-6 gutter. Border on the
    // bottom edge only — a band, never a card.
    <div className="-mx-4 border-b border-border-subtle bg-elevated px-4 pb-2.5 pt-1 md:-mx-6 md:px-6 md:pb-3">
      <div className="flex items-center justify-between gap-3">
        {/* MONTH = the page title, and the picker trigger.
            The <h1> is OUTSIDE the button, not inside it: a heading is flow
            content and a <button>'s content model is phrasing only, so
            `<button><h1>` is invalid HTML — the same class of nesting mistake
            design-system.md records for BentoCell. This way the page keeps
            exactly one h1 and the control is still a real button.
            min-h-[44px] so the title itself carries the touch target the
            retired prev/Today/next row used to provide. */}
        <h1 className="min-w-0 font-fw-display text-h2 leading-[1.15] tracking-[-0.022em]">
          <Button
            variant="ghost"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            className={cn(
              '-ml-1.5 h-auto min-h-[44px] min-w-0 max-w-full justify-start gap-1.5 rounded-fw-sm',
              'border-0 px-1.5 py-0 text-h2 font-medium leading-[1.15] tracking-[-0.022em]',
              'hover:bg-transparent focus-visible:ring-offset-elevated',
            )}
          >
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-semibold text-text-primary">{monthName}</span>
              <span className="font-light text-text-tertiary">{yearLabel}</span>
            </span>
            <span
              aria-hidden
              className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-surface-sunken"
              style={{ boxShadow: SEGMENTED_TRACK_SUNKEN_SHADOW }}
            >
              <ChevronDown className="h-3 w-3 text-text-tertiary" strokeWidth={3} />
            </span>
          </Button>
        </h1>

        {/* The ONE trailing control (AGENTS.md: "at most one visible trailing
            action"). Everything lower-priority lives behind it. */}
        <IconButton
          variant="secondary"
          size="sm"
          aria-label="More calendar actions"
          aria-haspopup="dialog"
          aria-expanded={overflowOpen}
          onClick={() => setOverflowOpen(true)}
        >
          <MoreHorizontal />
        </IconButton>
      </div>

      {/* THE WEEK NAVIGATION. */}
      <FairwayDayStrip
        className="mt-1"
        focusDate={focusDate}
        selectedDate={selectedDate}
        events={events}
        nowRef={nowRef}
        teamTimezone={teamTimezone}
        onSelectDate={onSelectDate}
        onNavigateWeek={onNavigate}
      />

      {/* ── Month picker (the chevron) — a REUSED Fairway bottom Sheet ─────── */}
      <Sheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        side="bottom"
        title="Jump to a month"
        description="Pick a month, or jump back to today."
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <IconButton
              variant="secondary"
              size="sm"
              aria-label="Previous year"
              onClick={() => setPickerYear((y) => y - 1)}
            >
              <ChevronLeft />
            </IconButton>
            <span className="font-fw-mono text-body-lg font-semibold tabular-nums text-text-primary">
              {pickerYear}
            </span>
            <IconButton
              variant="secondary"
              size="sm"
              aria-label="Next year"
              onClick={() => setPickerYear((y) => y + 1)}
            >
              <ChevronRight />
            </IconButton>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {MONTH_LABELS.map((label, index) => {
              const candidate = startOfMonth(setMonth(setYear(focusDate, pickerYear), index));
              const isCurrent = isSameMonth(candidate, focusDate);
              const isNowMonth = isSameMonth(candidate, nowRef);
              return (
                // `SelectablePill` is the repo's ONE selectable-cell primitive
                // (controls/selectable-pill.tsx) and this is exactly its
                // vocabulary: `active` = the month in focus (solid accent fill),
                // `future` = every other cell (sunken, dim). The month that
                // contains "now" gets a quiet ring so the picker can say "you
                // are here" without stealing the selected fill.
                <SelectablePill
                  key={label}
                  active={isCurrent}
                  future={!isCurrent}
                  aria-pressed={isCurrent}
                  onClick={() => {
                    onSelectDate(candidate);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    'h-11 w-full',
                    !isCurrent && isNowMonth && 'ring-2 ring-accent-300',
                  )}
                >
                  {label}
                </SelectablePill>
              );
            })}
          </div>

          {/* "Today" is not lost with the nav row — it lands here, where someone
              who has navigated away from the current week goes looking. */}
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => {
              onNavigate('today');
              setPickerOpen(false);
            }}
          >
            Jump to today
          </Button>

          {/* A quiet one-month step either way, for anyone who overshot by one. */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden />}
              onClick={() => onSelectDate(startOfMonth(addMonths(focusDate, -1)))}
            >
              {format(addMonths(focusDate, -1), 'MMM')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ChevronRight className="h-4 w-4" aria-hidden />}
              onClick={() => onSelectDate(startOfMonth(addMonths(focusDate, 1)))}
            >
              {format(addMonths(focusDate, 1), 'MMM')}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* ── Overflow — the lower-priority actions ──────────────────────────── */}
      <Sheet
        open={overflowOpen}
        onOpenChange={setOverflowOpen}
        side="bottom"
        title="Calendar actions"
        hideTitle
      >
        <div className="flex flex-col gap-1">
          {/* An Inset row inside the sheet, not a nested card: a bordered card
              inside a bordered surface is the "card-in-card" tell surface.tsx
              rules out. `bg-surface-sunken` is the tint step it prescribes. */}
          <Button
            variant="ghost"
            leftIcon={<CalendarPlus className="h-5 w-5 text-accent-700" aria-hidden />}
            onClick={() => {
              setOverflowOpen(false);
              onSubscribe();
            }}
            className={cn(
              'h-auto min-h-[52px] w-full justify-start gap-3 rounded-fw-md border-0',
              'whitespace-normal bg-surface-sunken px-4 py-3 text-left font-normal',
              'hover:bg-surface-tint',
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="font-fw-sans text-body font-medium text-text-primary">
                Add to phone
              </span>
              <span className="font-fw-sans text-caption text-text-tertiary">
                Subscribe to this calendar in iOS, Google or Outlook
              </span>
            </span>
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
