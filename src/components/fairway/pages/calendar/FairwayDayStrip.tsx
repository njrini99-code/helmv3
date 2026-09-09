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
 * race the server clock and trip React #418. `focusDate`/`nowRef` are seeded
 * via `zonedMidnight` (an explicit team timezone, not the calling process's
 * own ambient zone — see FairwayCalendar) so the day numbers rendered here
 * are byte-identical between SSR and the first client render; no
 * `suppressHydrationWarning` needed.
 *
 * GOTCHA (a): native <button> per pill, never `Surface as="button"`.
 *
 * DENSITY-DOT BUCKETING (timezone): events are keyed by calendar day via
 * `getZonedDateParts(iso, teamTimezone)`, NOT a raw `.slice(0, 10)` of the
 * event's ISO instant. `start_date`/`start_time` are `timestamptz` values
 * (UTC on the wire) — naively slicing the first 10 chars reads the UTC
 * calendar date, which silently disagrees with the team-timezone date for
 * any event within the UTC offset window straddling midnight (e.g. an
 * 11 PM ET event is already "tomorrow" in UTC) — a late-evening event's dot
 * would render on the wrong day pill. `getZonedDateParts` is the same
 * explicit-timezone helper the Wave-0 hydration fix (`zonedMidnight`) uses
 * for `focusDate`/`nowRef`, so density dots and the day pills they annotate
 * agree on "which day" an event belongs to.
 * ========================================================================== */

import * as React from 'react';
import { startOfWeek, addDays, isSameDay, isBefore, format } from 'date-fns';
import { cn } from '@/lib/utils';
import surfaces from './CalendarSurfaces.module.css';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import { Button } from '@/components/fairway/controls/button';
import { fwHaptic } from '@/lib/fairway/haptics';
import { getZonedDateParts } from '@/lib/calendar/timezone';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

/** Same `yyyy-MM-dd` shape as `format(day, 'yyyy-MM-dd')` on the local pill
 *  Dates below, but derived from the event's ISO instant AS SEEN in
 *  `timezone` rather than the calling process's own ambient zone. */
function zonedDayKey(iso: string, timezone: string | null | undefined): string {
  const { year, month, day } = getZonedDateParts(iso, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

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
  class: 'bg-text-tertiary',
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
  /**
   * Team timezone (IANA name, e.g. "America/New_York") used to bucket events
   * into calendar days for the density dots — see the file-header note.
   * `null` falls back to `DEFAULT_TIMEZONE` inside `getZonedDateParts`.
   */
  teamTimezone: string | null;
  /** Called when the user taps a day pill. */
  onSelectDate: (date: Date) => void;
  /**
   * Phone gesture: a horizontal swipe across the strip moves one week.
   * Swiping left (finger moves toward the left) asks for the NEXT week, the
   * way a page turns. Vertical drags are left to the page scroll.
   */
  onSwipe?: (direction: 'prev' | 'next') => void;
  className?: string;
}

const SWIPE_MIN_PX = 48;
const SWIPE_MAX_DRIFT_PX = 40;

export function FairwayDayStrip({
  focusDate,
  selectedDate,
  events,
  nowRef,
  teamTimezone,
  onSelectDate,
  onSwipe,
  className,
}: FairwayDayStripProps) {
  const { ref: railRef, fadeStyle } = useScrollFade<HTMLDivElement>('x');
  const swipeRef = React.useRef<{ x: number; y: number; id: number } | null>(null);
  const handleSwipeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onSwipe || event.pointerType === 'mouse') return;
    swipeRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const handleSwipeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || !onSwipe || start.id !== event.pointerId) return;
    const rail = selectedRef.current?.parentElement;
    // A strip that scrolls (very narrow phones) pans instead of paging.
    if (rail && rail.scrollWidth > rail.clientWidth + 1) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > SWIPE_MAX_DRIFT_PX) return;
    fwHaptic('light');
    onSwipe(dx < 0 ? 'next' : 'prev');
  };
  const selectedRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const selected = selectedRef.current;
    const rail = selected?.parentElement;
    if (!selected || !rail) return;
    const keepSelectedVisible = () => {
      if (rail.scrollWidth <= rail.clientWidth) return;
      const item = selected.getBoundingClientRect();
      const bounds = rail.getBoundingClientRect();
      if (item.left < bounds.left + 28 || item.right > bounds.right - 28) {
        rail.scrollLeft += item.left + item.width / 2 - bounds.left - bounds.width / 2;
      }
    };
    keepSelectedVisible();
    const observer = new ResizeObserver(keepSelectedVisible);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [selectedDate, focusDate]);

  const days = React.useMemo(() => {
    const weekStart = startOfWeek(focusDate, { weekStartsOn: WEEK_STARTS_ON });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [focusDate]);

  // Bucket events by yyyy-MM-dd (team-timezone calendar day, not raw UTC) for
  // O(1) per-pill lookup — see the file-header DENSITY-DOT BUCKETING note.
  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const iso = ev.start_date || ev.start_time;
      if (!iso) continue;
      const key = zonedDayKey(iso, teamTimezone);
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);
    }
    return map;
  }, [events, teamTimezone]);

  // Local-midnight projection of `nowRef` — stable today/past reference.
  const todayRef = React.useMemo(
    () => new Date(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate()),
    [nowRef],
  );

  return (
    <div
      role="group"
      aria-label="Week navigator"
      ref={railRef}
      style={fadeStyle}
      onPointerDown={handleSwipeStart}
      onPointerUp={handleSwipeEnd}
      onPointerCancel={() => { swipeRef.current = null; }}
      className={cn('grid grid-flow-col auto-cols-[minmax(44px,1fr)] gap-0.5 overflow-x-auto overscroll-x-contain touch-pan-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-1', className)}
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
          // GOTCHA (a): Fairway <Button variant="ghost">, not Surface as="button".
          <Button
            key={key}
            ref={dayIsSelected ? selectedRef : undefined}
            type="button"
            variant="ghost"
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
              'group relative block h-auto min-h-[60px] w-full border-0 font-normal md:min-h-[68px]',
              'rounded-fw-md px-0.5 py-1 md:px-2 md:py-2',
              'transition-[background-color,box-shadow,transform,color] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              'motion-reduce:transition-none',
              'bg-transparent hover:bg-surface/60 active:translate-y-0',
              surfaces.press,
              // Selected — the emerald disc below carries the fill; the cell
              // itself stays glass-clear so the strip reads as one instrument.
              dayIsSelected && 'text-text-primary',
            )}
          >
            <span className="flex h-full min-h-[44px] w-full flex-col items-center justify-center gap-1">
              {/* Day-of-week eyebrow. */}
              <span
                className={cn(
                  'font-fw-sans text-caption font-medium leading-none tracking-[0.01em]',
                  dayIsSelected
                    ? 'font-semibold text-accent-700'
                    : dayIsToday
                      ? 'font-semibold text-accent-700'
                      : // PAST: quieted by ROLE, not by alpha. `text-text-tertiary/60`
                        // resolved to #5b5854 on the sunken well — 2.72:1, well under
                        // AA. text-tertiary is already the dimmest AA-safe ink token
                        // (≥4.5:1 on canvas/surface/sunken by construction), so
                        // fading it further just breaks it; past days now read one
                        // role quieter than upcoming ones instead.
                        'text-text-tertiary',
                )}
              >
                {format(day, 'EEE')}
              </span>

              {/* Day number — Fragment-Mono tabular-nums, inside a 32px disc.
                  Selected = the emerald fill; today = a quiet ring. */}
              <span
                className={cn(
                  // A 40px rounded square: the reference's selected-day tile.
                  'grid h-10 w-10 place-items-center rounded-lg font-fw-sans text-[1.0625rem] font-semibold leading-none tabular-nums transition-[background-color,color,transform] motion-reduce:transition-none',
                  dayIsSelected && cn('text-text-on-accent', surfaces.selected),
                  !dayIsSelected && dayIsToday && 'text-accent-700',
                  dayIsSelected
                    ? 'text-text-on-accent'
                    : dayIsToday
                      ? 'text-accent-700'
                    : dayIsPast
                      ? // The DATE is the data in this cell, so it must outrank its
                        // own weekday label. At tertiary/70 (3.43:1) it was landing
                        // within a hair of the /60 label above it — two equally dim
                        // greys, no hierarchy. Secondary keeps past days recessive
                        // relative to upcoming (text-primary) while restoring the
                        // number-over-label order.
                        'text-text-secondary'
                      : 'text-text-primary',
                )}
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
                        TYPE_DOT_CLASS[t] ?? DEFAULT_DOT_CLASS,
                        dayIsPast && !dayIsSelected && 'opacity-50',
                      )}
                    />
                  ))
                )}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
