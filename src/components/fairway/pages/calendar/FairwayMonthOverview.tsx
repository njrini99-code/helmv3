'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayMonthOverview — the phone's compact month
 * ----------------------------------------------------------------------------
 * A thin adapter over the shared `CalendarSurface` (React DayPicker) for the
 * phone Month view: a controlled month, the selected date, a deterministic
 * "today", and event-day dots derived from the SAME timezone-aware projection
 * the agenda uses (`eventDaySpan`), so a day that shows a dot here shows rows
 * below. Three distinct states: today (ring), selected (fill), has events
 * (dot). One accessible day target per date — DayPicker's own.
 *
 * The month caption and chevrons are hidden: the calendar toolbar above
 * already names the month and steps it. Selecting a day only changes the
 * selected date; it never switches the display mode.
 *
 * One lifted card (the same raised material as the agenda's day groups) with
 * the day numbers in the same sans face (tabular figures) as the day strip
 * and the agenda rows — never the mono face the desktop grid uses for dense
 * cells.
 * ========================================================================== */

import * as React from 'react';
import { startOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarSurface } from '@/components/fairway/calendar';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { eventDaySpan } from '@/lib/calendar/timezone';

export interface FairwayMonthOverviewProps {
  events: CalendarEvent[];
  /** The selected date; its month is the month on screen. */
  selectedDate: Date;
  /** Parent-owned "today" (seeded from serverNow). */
  nowRef: Date;
  timezone?: string | null;
  onSelectDate: (date: Date) => void;
  /** Swiping/stepping inside the grid — forwarded so the toolbar agrees. */
  onMonthChange?: (month: Date) => void;
  className?: string;
}

const MAX_SPAN_DAYS = 62;

export function FairwayMonthOverview({
  events,
  selectedDate,
  nowRef,
  timezone,
  onSelectDate,
  onMonthChange,
  className,
}: FairwayMonthOverviewProps) {
  const eventDays = React.useMemo(() => {
    const seen = new Map<string, Date>();
    for (const event of events) {
      const span = eventDaySpan(event, timezone);
      if (!span) continue;
      const cursor = new Date(span.first);
      for (let i = 0; i < MAX_SPAN_DAYS && cursor <= span.last; i++) {
        const key = cursor.toDateString();
        if (!seen.has(key)) seen.set(key, new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return Array.from(seen.values());
  }, [events, timezone]);

  return (
    <CalendarSurface
      mode="single"
      required
      selected={selectedDate}
      onSelect={(date) => { if (date) onSelectDate(date); }}
      month={startOfMonth(selectedDate)}
      onMonthChange={onMonthChange}
      today={nowRef}
      eventDays={eventDays}
      size="comfortable"
      glass={false}
      hideNavigation
      showOutsideDays
      className={cn(
        // THE card, lifted: hairline plus the lit top edge and the raised whisper.
        'rounded-card border-border-subtle bg-surface [box-shadow:inset_0_1px_0_oklch(1_0_0/0.55),var(--fw-shadow-soft)]',
        // The same sans, tabular figures as every other date in the calendar.
        '[&_.rdp-day_button]:font-fw-sans [&_.rdp-day_button]:font-medium [&_.rdp-day_button]:text-body-lg',
        className,
      )}
      classNames={{
        // The toolbar above already names and steps the month.
        month_caption: 'sr-only',
        // Fill the phone width: DayPicker's table stretches, day buttons stay
        // their 44px targets centered in each cell.
        root: 'w-full',
        months: 'w-full',
        month: 'w-full',
        month_grid: 'w-full',
      }}
    />
  );
}
