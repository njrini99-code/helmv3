'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayDayStrip
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy `editorial/DayStrip` — seven sculpted day
 * pills that frame the visible week and show event density via tiny dots.
 *
 * Fairway tokens:
 *   - rest    → bg-inset (toasted-cream well), muted past days
 *   - selected → bg-accent-500 + cream text (the green CTA fill)
 *   - today    → ring-2 ring-accent-300 (a quiet calibration ring)
 *   - density  → up to 3 dots colored by event-type tone (accent/warning/
 *     success/neutral), straight from REAL per-day event counts.
 *
 * HYDRATION: `nowRef` is parent-owned (seeded from serverNow, rehydrated post
 * mount). We NEVER call `Date.now()` / date-fns `isToday()` here — that would
 * race the server clock and trip React #418. Day numbers are stable text;
 * `suppressHydrationWarning` scopes any post-hydration reflow.
 *
 * GOTCHA (a): native <button> per pill, never `Surface as="button"`.
 * ========================================================================== */

import * as React from 'react';
import { startOfWeek, addDays, isSameDay, isBefore, format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

const WEEK_STARTS_ON = 0 as const;

/** event_type → density-dot tint, same tone vocabulary as FairwayEventCard. */
const TYPE_DOT_CLASS: Record<string, string> = {
  practice: 'bg-accent-500',
  tournament: 'bg-fw-warning',
  qualifier: 'bg-fw-success',
  qualifying: 'bg-fw-success',
  travel: 'bg-text-tertiary',
  workout: 'bg-accent-500',
  team_meeting: 'bg-text-tertiary',
  meeting: 'bg-text-tertiary',
};
const DEFAULT_DOT_CLASS = 'bg-text-tertiary';

export interface FairwayDayStripProps {
  /** Anchor — the strip frames the week containing this date. */
  focusDate: Date;
  /** The currently selected day (drives the agenda below). */
  selectedDate: Date;
  /** All events visible in the window — used to compute density dots. */
  events: CalendarEvent[];
  /**
   * Reference "now" (parent-owned). Marks the today ring + past-day muting.
   * Seeded from `serverNow` so SSR + first client render agree.
   */
  nowRef: Date;
  /** Called when the user taps a day pill. */
  onSelectDate: (date: Date) => void;
  className?: string;
}

export function FairwayDayStrip({
  focusDate,
  selectedDate,
  events,
  nowRef,
  onSelectDate,
  className,
}: FairwayDayStripProps) {
  const days = React.useMemo(() => {
    const weekStart = startOfWeek(focusDate, { weekStartsOn: WEEK_STARTS_ON });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [focusDate]);

  // Bucket events by yyyy-MM-dd for O(1) per-pill lookup.
  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = (ev.start_date || ev.start_time || '').slice(0, 10);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);
    }
    return map;
  }, [events]);

  // Local-midnight projection of `nowRef` — stable today/past reference.
  const todayRef = React.useMemo(
    () => new Date(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate()),
    [nowRef],
  );

  return (
    <div
      role="group"
      aria-label="Week navigator"
      className={cn('grid grid-cols-7 gap-1.5 md:gap-2.5', className)}
    >
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const dayEvents = eventsByDay.get(key) ?? [];
        const dayIsToday = isSameDay(day, todayRef);
        const dayIsSelected = isSameDay(day, selectedDate);
        const dayIsPast = !dayIsToday && isBefore(day, todayRef);

        // Up to 3 distinct event-type dots, ordered by first appearance.
        const dotTypes: string[] = [];
        for (const ev of dayEvents) {
          const t = (ev.event_type || 'other').toLowerCase();
          if (!dotTypes.includes(t)) dotTypes.push(t);
          if (dotTypes.length >= 3) break;
        }

        return (
          // GOTCHA (a): native <button>, not Surface as="button".
          <button
            key={key}
            type="button"
            onClick={() => {
              if (dayIsSelected) return;
              onSelectDate(day);
            }}
            aria-current={dayIsToday ? 'date' : undefined}
            aria-pressed={dayIsSelected}
            aria-label={`${format(day, 'EEEE, MMMM d')}${
              dayEvents.length
                ? ` — ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`
                : ' — no events'
            }`}
            className={cn(
              'group relative flex min-h-[78px] flex-col items-center justify-between md:min-h-[88px]',
              'rounded-card px-1.5 py-2.5 md:px-2 md:py-3',
              'transition-[background-color,box-shadow,transform,color] duration-[180ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              'motion-reduce:transition-none',
              // Selected — the green CTA fill (overrides everything else).
              dayIsSelected && 'bg-accent-500 text-text-on-accent shadow-soft',
              // Today (not selected) — quiet accent ring on a toasted well.
              !dayIsSelected && dayIsToday && 'bg-inset ring-2 ring-accent-300',
              // Resting / past — toasted-cream well with a subtle hover.
              !dayIsSelected && !dayIsToday && [
                'bg-inset hover:shadow-soft hover:-translate-y-px active:translate-y-0',
                'motion-reduce:hover:translate-y-0',
              ],
            )}
          >
            {/* Day-of-week eyebrow. */}
            <span
              className={cn(
                'font-fw-display text-eyebrow uppercase leading-none tracking-[0.12em]',
                dayIsSelected
                  ? 'text-text-on-accent/85'
                  : dayIsToday
                    ? 'text-accent-700'
                    : dayIsPast
                      ? 'text-text-tertiary/60'
                      : 'text-text-tertiary',
              )}
            >
              {format(day, 'EEE')}
            </span>

            {/* Day number — Fragment-Mono tabular-nums. */}
            <span
              className={cn(
                'font-fw-mono text-h3 font-semibold leading-none tabular-nums',
                dayIsSelected
                  ? 'text-text-on-accent'
                  : dayIsPast
                    ? 'text-text-tertiary/70'
                    : 'text-text-primary',
              )}
              suppressHydrationWarning
            >
              {format(day, 'd')}
            </span>

            {/* Density dots — up to 3 type-toned (capped at 3). */}
            <span aria-hidden className="flex h-1.5 items-center gap-[3px]">
              {dotTypes.length === 0 ? (
                <span className="h-1 w-1 rounded-full bg-transparent" />
              ) : (
                dotTypes.map((t, i) => (
                  <span
                    key={`${key}-${t}-${i}`}
                    className={cn(
                      'h-1 w-1 rounded-full',
                      dayIsSelected ? 'bg-text-on-accent/80' : TYPE_DOT_CLASS[t] ?? DEFAULT_DOT_CLASS,
                      dayIsPast && !dayIsSelected && 'opacity-50',
                    )}
                  />
                ))
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default FairwayDayStrip;
