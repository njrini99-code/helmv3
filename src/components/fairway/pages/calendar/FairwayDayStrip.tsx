'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayDayStrip
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy `editorial/DayStrip` — seven sculpted day
 * pills that frame the visible week and show event density via tiny dots.
 *
 * ONE continuous rail (not seven separate pills): a single sunken track
 * (bg-surface-sunken, rounded-fw-md, p-1) holding seven equal cells. Fairway
 * tokens:
 *   - rest     → transparent over the sunken track, muted past days
 *   - selected → a tinted matte island (bg-surface + accent text,
 *     rounded-fw-sm) — NO frost; frost is spent on the masthead bar this
 *     strip lives inside, never nested glass-on-glass.
 *   - today    → the accent number dot (a small dot under the day number),
 *     independent of selection so "today" and "selected" read as two
 *     channels, not one competing ring.
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
 * GOTCHA (a): each cell is a native <button> via `PressTarget` (never
 * `Surface as="button"`, never Fairway `Button` — `Button` fires its own
 * unconditional `fwHaptic('light')` on click, which would tick even on a
 * re-tap of the already-selected day; `PressTarget`'s own selection haptic is
 * disabled here (`haptic={false}`) so the strip can fire it itself, and only
 * when the day actually changes — see the onClick below).
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
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import { PressTarget } from '@/components/fairway/controls/press-target';
import { fwHaptic } from '@/lib/fairway/haptics';
import { eventDaySpan } from '@/lib/calendar/timezone';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { typeMeta } from './eventPresentation';
import type { FwStatusTone } from '@/components/fairway/controls';

/** Same `yyyy-MM-dd` shape as `format(day, 'yyyy-MM-dd')` on the local pill
 *  Dates below, but derived from the event's ISO instant AS SEEN in
 *  `timezone` rather than the calling process's own ambient zone. */
const WEEK_STARTS_ON = 0 as const;
/** Longest multi-day span a single event may mark (guards a bad end date). */
const MAX_SPAN_DAYS = 62;

/**
 * Density-dot tint, keyed by TONE rather than by event_type: three copies of
 * an event-type presentation table already exist (this file, the drawer,
 * eventPresentation.ts — see calendar.mobile.md RISKS #5), so a type-keyed
 * dot map here would be a FOURTH list that a new event_type could miss
 * silently. Routing through `typeMeta(...).tone` — the canonical
 * eventPresentation.ts lookup, import-only per this package's ownership —
 * means a new type automatically gets a correct dot color (via its tone and
 * `typeMeta`'s own 'other' fallback) with nothing to keep in sync here. This
 * tone→class map is the one remaining local table, and it is exhaustive over
 * `FwStatusTone` (a closed union), so it cannot drift the way a type-keyed
 * map could.
 */
const TONE_DOT_CLASS: Record<FwStatusTone, string> = {
  neutral: 'bg-text-tertiary',
  accent: 'bg-accent-500',
  success: 'bg-fw-success',
  warning: 'bg-fw-warning',
  danger: 'bg-fw-danger',
  info: 'bg-text-primary',
};

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
  // A commitment occupies EVERY day it runs (`eventDaySpan`, the same
  // interpretation the agenda and month overview use), so a three-day
  // tournament marks three pills, not just the day it starts.
  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const span = eventDaySpan(ev, teamTimezone);
      if (!span) continue;
      let cursor = span.first;
      for (let i = 0; i < MAX_SPAN_DAYS && cursor <= span.last; i++) {
        const key = format(cursor, 'yyyy-MM-dd');
        const list = map.get(key);
        if (list) list.push(ev);
        else map.set(key, [ev]);
        cursor = addDays(cursor, 1);
      }
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
      className={cn(
        // ONE continuous track — the rail itself is the sunken well; each
        // cell below is transparent over it except the selected island.
        'grid grid-flow-col auto-cols-[minmax(44px,1fr)] gap-0.5 overflow-x-auto overscroll-x-contain touch-pan-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'bg-surface-sunken rounded-fw-md p-1 md:gap-1',
        className,
      )}
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
          // GOTCHA (a) — see the file header: PressTarget, haptic disabled,
          // the strip fires its own gated selection tick below.
          <PressTarget
            key={key}
            ref={dayIsSelected ? selectedRef : undefined}
            haptic={false}
            onClick={() => {
              if (dayIsSelected) return;
              fwHaptic('selection');
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
              'group relative block h-auto min-h-[60px] w-full font-normal md:min-h-[68px]',
              // The selected day is a tinted matte island on the sunken
              // track — bg-surface + accent text, one radius step down from
              // the track (rounded-fw-sm), no frost (frost is spent on the
              // masthead bar this strip lives inside).
              'rounded-fw-sm px-0.5 py-1 md:px-2 md:py-2',
              dayIsSelected
                ? 'bg-surface shadow-flat'
                : '[@media(hover:hover)]:hover:bg-surface-tint',
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

              {/* Day number — accent text for selected/today (the island's
                  background is what marks "selected" now; the number itself
                  no longer carries a filled disc or a ring). */}
              <span
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full font-fw-sans text-body font-semibold leading-none tabular-nums',
                  dayIsSelected || dayIsToday
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

              {/* The accent "today" dot — independent of selection, so
                  today and selected read as two channels rather than one
                  ring competing with the island. Fixed-height row (like the
                  density row below) so non-today cells don't shift. */}
              <span aria-hidden className="flex h-1 items-center justify-center">
                {dayIsToday ? <span className="h-1 w-1 rounded-full bg-accent-600" /> : null}
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
                        TONE_DOT_CLASS[typeMeta(t).tone],
                        dayIsPast && !dayIsSelected && 'opacity-50',
                      )}
                    />
                  ))
                )}
              </span>
            </span>
          </PressTarget>
        );
      })}
    </div>
  );
}
