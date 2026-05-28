'use client';

/**
 * DayStrip — editorial week-of-7 day pills.
 *
 * The centerpiece of the redesigned Calendar surface. Replaces the cluttered
 * mini-calendar with seven sculpted pills that frame the visible week and
 * communicate event density via tiny dots beneath each day number.
 *
 * Behavior:
 *  - Shows the week containing `focusDate` (Sunday → Saturday).
 *  - Today is rendered as a `surface-stone` plinth with a primary-500 ring
 *    and bottom underline (echoing the new GolfTabBar treatment).
 *  - The currently selected day fills with warm-100; past days are warm-300
 *    muted; future days warm-700.
 *  - Clicking a pill calls `onSelectDate`. Tapping the active pill is a no-op.
 *  - Density indicator shows up to 3 dots colored by event type. Counts are
 *    stable (computed via `useMemo`) and capped at 3.
 *
 * Touch targets are ≥44px tall. Spacing tightens at 390px.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { startOfWeek, addDays, isSameDay, isBefore, format } from 'date-fns';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

// Type → token color (kept in sync with EventChip).
const TYPE_DOT_CLASS: Record<string, string> = {
  practice: 'bg-sage-500',
  tournament: 'bg-helm-amber',
  qualifier: 'bg-primary-500',
  qualifying: 'bg-primary-500',
  travel: 'bg-warm-700',
  team_meeting: 'bg-warm-500',
  meeting: 'bg-warm-500',
};
const DEFAULT_DOT_CLASS = 'bg-warm-400';

interface DayStripProps {
  /** Anchor — the strip frames the week containing this date. */
  focusDate: Date;
  /** The currently selected day (drives the agenda below). */
  selectedDate: Date;
  /** All events visible in the calendar window — used to compute density dots. */
  events: CalendarEvent[];
  /**
   * Reference "now" used to mark the today plinth + past-day muting.
   * Owned by the parent surface so the SSR snapshot and first client render
   * agree on which day is "today" — calling `new Date()` (or `isToday()`) in
   * here would race the server clock and trigger React error #418.
   */
  nowRef: Date;
  /** Called when the user taps a day pill. */
  onSelectDate: (date: Date) => void;
  className?: string;
}

const TODAY_LABEL_FMT = (d: Date) => format(d, 'EEE');
const WEEK_STARTS_ON = 0 as const;

export function DayStrip({
  focusDate,
  selectedDate,
  events,
  nowRef,
  onSelectDate,
  className,
}: DayStripProps) {
  // Derive the visible 7-day window from focusDate.
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

  // Local-midnight projection of `nowRef` so the "today" plinth + past-day
  // muting is computed off a stable reference. Parent owns the rehydration.
  const todayRef = React.useMemo(
    () => new Date(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate()),
    [nowRef],
  );

  return (
    <div
      role="group"
      aria-label="Week navigator"
      className={cn(
        'grid grid-cols-7 gap-1.5 md:gap-3',
        className,
      )}
    >
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const dayEvents = eventsByDay.get(key) ?? [];
        // `isSameDay(day, todayRef)` — driven by the parent-owned `nowRef`.
        // `date-fns/isToday` calls `Date.now()` directly which would diverge
        // between server and first client render.
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
          <button
            key={key}
            type="button"
            onClick={() => {
              if (dayIsSelected) return;
              void triggerHaptic('light');
              onSelectDate(day);
            }}
            aria-current={dayIsToday ? 'date' : undefined}
            aria-pressed={dayIsSelected}
            aria-label={`${format(day, 'EEEE, MMMM d')}${dayEvents.length ? ` — ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ' — no events'}`}
            className={cn(
              // Layout — tall enough for editorial day number + label + dots.
              'group relative flex flex-col items-center justify-between',
              'min-h-[78px] md:min-h-[92px] py-2.5 md:py-3 px-1.5 md:px-2',
              'rounded-2xl',
              'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
              // Touch target: ≥44px guaranteed by min-h above.

              // Today plinth — surface-stone with primary ring + underline.
              dayIsToday && !dayIsSelected && 'surface-stone ring-1 ring-primary-500/40',
              dayIsToday && !dayIsSelected &&
                'after:absolute after:left-3 after:right-3 after:bottom-1 after:h-[1.5px] after:rounded-full after:bg-primary-500/70',

              // Selected — warm-100 fill (overrides today).
              dayIsSelected && 'bg-warm-100/85 ring-1 ring-warm-200/70 shadow-[0_1px_2px_hsl(42_14%_22%/0.04)]',

              // Resting — subtle hover lift.
              !dayIsSelected && !dayIsToday && [
                'hover:bg-cream-100/55',
                'active:scale-[0.98]',
              ],
            )}
          >
            {/* Day-of-week eyebrow — uppercase tracking. */}
            <span
              className={cn(
                'font-serif uppercase text-eyebrow tracking-[0.12em] leading-none',
                dayIsSelected && 'text-warm-900',
                !dayIsSelected && dayIsToday && 'text-primary-700',
                !dayIsSelected && !dayIsToday && dayIsPast && 'text-warm-300',
                !dayIsSelected && !dayIsToday && !dayIsPast && 'text-warm-500',
              )}
            >
              {TODAY_LABEL_FMT(day)}
            </span>

            {/* Editorial day number. */}
            <span
              className={cn(
                'font-display text-h2 font-medium leading-none tracking-[-0.02em] tabular-nums',
                dayIsSelected && 'text-warm-900',
                !dayIsSelected && dayIsToday && 'text-warm-900',
                !dayIsSelected && !dayIsToday && dayIsPast && 'text-warm-300',
                !dayIsSelected && !dayIsToday && !dayIsPast && 'text-warm-700',
              )}
              suppressHydrationWarning
            >
              {format(day, 'd')}
            </span>

            {/* Density dots — up to 3 type-colored, fall back to neutral. */}
            <span
              aria-hidden
              className="flex items-center gap-[3px] h-1.5"
            >
              {dotTypes.length === 0 ? (
                <span className="h-1 w-1 rounded-full bg-transparent" />
              ) : (
                dotTypes.map((t, i) => (
                  <span
                    key={`${key}-${t}-${i}`}
                    className={cn(
                      'h-1 w-1 rounded-full',
                      TYPE_DOT_CLASS[t] ?? DEFAULT_DOT_CLASS,
                      dayIsPast && 'opacity-50',
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
