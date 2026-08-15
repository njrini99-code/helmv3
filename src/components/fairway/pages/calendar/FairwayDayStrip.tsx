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
import { Button } from '@/components/fairway/controls/button';
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
  className?: string;
}

export function FairwayDayStrip({
  focusDate,
  selectedDate,
  events,
  nowRef,
  teamTimezone,
  onSelectDate,
  className,
}: FairwayDayStripProps) {
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
          // GOTCHA (a): Fairway <Button variant="ghost">, not Surface as="button".
          <Button
            key={key}
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
              'group relative block h-auto min-h-[78px] w-full border-0 font-normal md:min-h-[88px]',
              'rounded-card px-1.5 py-2.5 md:px-2 md:py-3',
              'transition-[background-color,box-shadow,transform,color] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              'motion-reduce:transition-none',
              // Selected — the green CTA fill (overrides everything else).
              dayIsSelected && 'bg-accent-750 text-text-on-accent shadow-soft hover:bg-accent-800',
              // Today (not selected) — quiet accent ring on a toasted well.
              !dayIsSelected && dayIsToday && 'bg-inset ring-2 ring-accent-300',
              // Resting / past — toasted-cream well with a subtle hover.
              !dayIsSelected && !dayIsToday && [
                'bg-inset hover:bg-inset hover:shadow-soft hover:-translate-y-px active:translate-y-0',
                'motion-reduce:hover:translate-y-0',
              ],
            )}
          >
            <span className="flex h-full min-h-[78px] w-full flex-col items-center justify-between md:min-h-[88px]">
              {/* Day-of-week eyebrow. */}
              <span
                className={cn(
                  'font-fw-display text-eyebrow uppercase leading-none tracking-[0.12em]',
                  dayIsSelected
                    ? 'text-text-on-accent/85'
                    : dayIsToday
                      ? 'text-accent-700'
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

              {/* Day number — Fragment-Mono tabular-nums. */}
              <span
                className={cn(
                  'font-fw-mono text-h3 font-semibold leading-none tabular-nums',
                  dayIsSelected
                    ? 'text-text-on-accent'
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
                        dayIsSelected ? 'bg-text-on-accent/80' : TYPE_DOT_CLASS[t] ?? DEFAULT_DOT_CLASS,
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
