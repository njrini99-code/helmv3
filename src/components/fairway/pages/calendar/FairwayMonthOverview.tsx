'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayMonthOverview — the phone's compact month
 * ----------------------------------------------------------------------------
 * A thin adapter over the shared `CalendarSurface` (React DayPicker) for the
 * phone Month view, in one card under the same deep-green header as the
 * desktop month: how many events the month holds, and a legend of their
 * types. Each day carries up to three dots in its events' type colors (the
 * Day, Week and Month tints), derived from the SAME timezone-aware projection
 * the agenda uses (`eventDaySpan`), so a day that shows a dot here shows rows
 * below. Three distinct states: today (ring), selected (fill), has events
 * (dots). One accessible day target per date — DayPicker's own.
 *
 * The month caption and chevrons are hidden: the calendar toolbar above
 * already names the month and steps it. Selecting a day only changes the
 * selected date; it never switches the display mode.
 *
 * The day numbers are in the same sans face (tabular figures) as the day
 * strip and the agenda rows — never the mono face.
 * ========================================================================== */

import * as React from 'react';
import { addDays, format, startOfMonth } from 'date-fns';
import type { DayButtonProps } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { PressTarget } from '@/components/fairway';
import { CalendarSurface } from '@/components/fairway/calendar';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { typeMeta, typeToneClasses } from './eventPresentation';
import { MonthSummaryHeader, eventMonthItems, summarizeMonth } from './FairwayMonthGrid';
import { localDayKey } from './timeGrid';

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
const MAX_DOTS = 3;

/** Day key → the dot classes of the types on that day (at most three). */
const DayDotsContext = React.createContext<ReadonlyMap<string, readonly string[]>>(new Map());

/**
 * DayPicker's day button, plus the type dots. It keeps DayPicker's own
 * contract: a real button that takes focus when DayPicker moves focus to its
 * day (arrow-key navigation), with every prop DayPicker hands it.
 */
function OverviewDayButton({ day, modifiers, className, children, ...props }: DayButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  const dots = React.useContext(DayDotsContext).get(localDayKey(day.date)) ?? [];
  const selected = Boolean(modifiers.selected);
  return (
    <PressTarget ref={ref} data-selected={selected ? 'true' : undefined} className={cn('relative', className)} {...props}>
      {children}
      {dots.length > 0 ? (
        <span aria-hidden className="pointer-events-none absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5">
          {dots.map((dot) => (
            <span key={dot} className={cn('h-1 w-1 rounded-full', selected ? 'bg-text-on-accent-fill' : dot)} />
          ))}
        </span>
      ) : null}
    </PressTarget>
  );
}

const DAY_COMPONENTS = { DayButton: OverviewDayButton };

export function FairwayMonthOverview({
  events,
  selectedDate,
  nowRef,
  timezone,
  onSelectDate,
  onMonthChange,
  className,
}: FairwayMonthOverviewProps) {
  const items = React.useMemo(() => eventMonthItems(events, timezone), [events, timezone]);
  const summary = React.useMemo(() => summarizeMonth(items, selectedDate), [items, selectedDate]);

  const dayDots = React.useMemo(() => {
    const byDay = new Map<string, Array<{ label: string; dot: string }>>();
    const ordered = [...items].sort((a, b) => a.at - b.at);
    for (const item of ordered) {
      if (item.kind !== 'event') continue;
      const { label } = typeMeta(item.event.event_type);
      const { dot } = typeToneClasses(item.event.event_type);
      let cursor = item.first;
      for (let i = 0; i < MAX_SPAN_DAYS && cursor.getTime() <= item.last.getTime(); i++) {
        const key = localDayKey(cursor);
        const list = byDay.get(key) ?? [];
        if (list.length < MAX_DOTS && !list.some((d) => d.label === label)) list.push({ label, dot });
        byDay.set(key, list);
        cursor = addDays(cursor, 1);
      }
    }
    const out = new Map<string, readonly string[]>();
    for (const [key, list] of byDay) out.set(key, list.map((d) => d.dot));
    return out;
  }, [items]);

  return (
    <section
      aria-label={format(selectedDate, 'MMMM yyyy')}
      data-testid="month-overview"
      className={cn(
        'overflow-hidden rounded-card border border-border-subtle bg-surface',
        '[box-shadow:inset_0_1px_0_oklch(1_0_0/0.55),var(--fw-shadow-soft)]',
        className,
      )}
    >
      <div className="fw-plinth-green">
        <MonthSummaryHeader summary={summary} monthName={format(selectedDate, 'MMMM')} />
      </div>
      <DayDotsContext.Provider value={dayDots}>
        <CalendarSurface
          mode="single"
          required
          selected={selectedDate}
          onSelect={(date) => { if (date) onSelectDate(date); }}
          month={startOfMonth(selectedDate)}
          onMonthChange={onMonthChange}
          today={nowRef}
          size="comfortable"
          glass={false}
          hideNavigation
          showOutsideDays
          components={DAY_COMPONENTS}
          className={cn(
            'block w-full rounded-none border-0 bg-surface px-3 pb-3 pt-2',
            // The same sans, tabular figures as every other date in the calendar.
            '[&_.rdp-day_button]:font-fw-sans [&_.rdp-day_button]:font-medium [&_.rdp-day_button]:text-body-lg',
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
      </DayDotsContext.Provider>
    </section>
  );
}
