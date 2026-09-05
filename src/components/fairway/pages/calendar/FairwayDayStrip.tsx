'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayDayStrip
 * ----------------------------------------------------------------------------
 * Seven day cells that frame the visible week and show event density via tiny
 * dots. Since S1 (chrome collapse) this is THE WEEK NAVIGATION, not a passive
 * picker sitting under a nav row: the prev/Today/next cluster that used to live
 * above it in `FairwayCalendarHero` is gone, and paging happens here.
 *
 * ── MATERIAL: a sunken TRACK with a raised thumb ─────────────────────────────
 * The seven cells sit in ONE `bg-surface-sunken` well (`TRACK_SUNKEN_SHADOW` —
 * literally the string `Segmented` uses for its own track, imported rather than
 * copied) and the selected day is the only thing that lifts off it: an accent
 * fill with the "lit from above" inset highlight plus `--fw-shadow-soft`.
 *
 * That replaces seven individual `bg-inset` tiles, which read as seven cards on
 * a card and forced a 78/88px min-height to look deliberate. One track reads as
 * one control, and the whole block collapses to ~54px.
 *
 * The track needs a LIGHTER plane under it: `bg-surface-sunken` recedes BELOW
 * canvas in the dark scope (FairwayAgendaView records the same trap for its own
 * "Show earlier" control), so a well on bare canvas is not a well. The masthead
 * band that owns this strip is `bg-elevated` for exactly that reason.
 *
 * ── NAVIGATION ───────────────────────────────────────────────────────────────
 * Swipe left/right pages the week (`onNavigateWeek`). The gesture is measured
 * on `touchend` only — no `preventDefault` during the move, so this never
 * fights the page's own vertical scroll and needs no non-passive listener.
 *
 * Swipe is NOT the only way through, and it must not be: a gesture is invisible
 * to a keyboard and to assistive tech, so removing the prev/Today/next row
 * without a second route would have removed week navigation outright for those
 * users. The second route already exists and is deliberately NOT duplicated
 * here — `FairwayCalendar` binds ←/→ (and T for today) at the window level and
 * calls itself "the SOLE calendar-navigation keyboard owner". "Jump to today"
 * also lives in the masthead's month picker, as a visible control.
 *
 * HYDRATION: `nowRef` is parent-owned (seeded from serverNow, rehydrated post
 * mount). We NEVER call `Date.now()` / date-fns `isToday()` here — that would
 * race the server clock and trip React #418. `focusDate`/`nowRef` are seeded
 * via `zonedMidnight` (an explicit team timezone, not the calling process's
 * own ambient zone — see FairwayCalendar) so the day numbers rendered here
 * are byte-identical between SSR and the first client render; no
 * `suppressHydrationWarning` needed.
 *
 * GOTCHA (a): native <button> per cell, never `Surface as="button"`.
 *
 * DENSITY-DOT BUCKETING (timezone): events are keyed by calendar day via
 * `getZonedDateParts(iso, teamTimezone)`, NOT a raw `.slice(0, 10)` of the
 * event's ISO instant. `start_date`/`start_time` are `timestamptz` values
 * (UTC on the wire) — naively slicing the first 10 chars reads the UTC
 * calendar date, which silently disagrees with the team-timezone date for
 * any event within the UTC offset window straddling midnight (e.g. an
 * 11 PM ET event is already "tomorrow" in UTC) — a late-evening event's dot
 * would render on the wrong day cell. `getZonedDateParts` is the same
 * explicit-timezone helper the Wave-0 hydration fix (`zonedMidnight`) uses
 * for `focusDate`/`nowRef`, so density dots and the day cells they annotate
 * agree on "which day" an event belongs to.
 * ========================================================================== */

import * as React from 'react';
import { startOfWeek, addDays, isSameDay, isBefore, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button, SEGMENTED_TRACK_SUNKEN_SHADOW } from '@/components/fairway/controls';
import { getZonedDateParts } from '@/lib/calendar/timezone';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

/** Same `yyyy-MM-dd` shape as `format(day, 'yyyy-MM-dd')` on the local cell
 *  Dates below, but derived from the event's ISO instant AS SEEN in
 *  `timezone` rather than the calling process's own ambient zone. */
function zonedDayKey(iso: string, timezone: string | null | undefined): string {
  const { year, month, day } = getZonedDateParts(iso, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const WEEK_STARTS_ON = 0 as const;

/**
 * Horizontal travel (px) that counts as a week page. Matches the legacy
 * `CalendarDayViewSwipeable` threshold so the two swipe surfaces in this
 * product feel the same in the hand.
 */
const SWIPE_THRESHOLD_PX = 50;

/**
 * The selected day's raised thumb. Same "lit from above" grammar as
 * `--fw-shadow-card` and `Segmented`'s own pill: an inset top highlight over
 * the standard soft elevation, so the cell reads as sitting ON the well rather
 * than being a differently-coloured hole in it.
 */
const SELECTED_THUMB_SHADOW = 'inset 0 1px 0 oklch(1 0 0 / 0.28), var(--fw-shadow-soft)';

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
  /** Called when the user taps a day cell. */
  onSelectDate: (date: Date) => void;
  /**
   * Page the week. Wired to swipe and to ←/→ while focus is inside the strip.
   * Optional so the strip still renders as a plain picker for any caller that
   * owns navigation elsewhere (and so the existing tests need no change).
   */
  onNavigateWeek?: (direction: 'prev' | 'next') => void;
  className?: string;
}

export function FairwayDayStrip({
  focusDate,
  selectedDate,
  events,
  nowRef,
  teamTimezone,
  onSelectDate,
  onNavigateWeek,
  className,
}: FairwayDayStripProps) {
  const days = React.useMemo(() => {
    const weekStart = startOfWeek(focusDate, { weekStartsOn: WEEK_STARTS_ON });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [focusDate]);

  // Bucket events by yyyy-MM-dd (team-timezone calendar day, not raw UTC) for
  // O(1) per-cell lookup — see the file-header DENSITY-DOT BUCKETING note.
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

  // ── Swipe = week paging ────────────────────────────────────────────────────
  // Read on touchend only. Deliberately no `preventDefault` in a move handler:
  // React's synthetic touch listeners are passive, so calling it there is both
  // a console warning and a no-op, and intercepting the move is what makes a
  // horizontal-ish gesture fight the page's vertical scroll.
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
  }, []);

  const handleTouchEnd = React.useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || !onNavigateWeek) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      // Horizontal intent only — a mostly-vertical drag is a page scroll that
      // happened to begin on the strip, and must not turn the week.
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (dx <= -SWIPE_THRESHOLD_PX) onNavigateWeek('next');
      else if (dx >= SWIPE_THRESHOLD_PX) onNavigateWeek('prev');
    },
    [onNavigateWeek],
  );

  // NOTE: no keyboard handler here on purpose. `FairwayCalendar` binds ←/→
  // (and T) at the window level and its own comment names it "the SOLE
  // calendar-navigation keyboard owner" — a second handler on this group would
  // be a second owner to desync with, and the page-level one already covers the
  // keyboard route that swipe cannot. That is what stops swipe from being the
  // ONLY way to page the week.

  return (
    <div
      role="group"
      aria-label="Week navigator"
      onTouchStart={onNavigateWeek ? handleTouchStart : undefined}
      onTouchEnd={onNavigateWeek ? handleTouchEnd : undefined}
      className={cn(
        // ONE sunken track holding all seven cells. `rounded-full` so the track
        // and the selected thumb share a silhouette, exactly like Segmented.
        'grid grid-cols-7 gap-0.5 rounded-full bg-surface-sunken p-1',
        className,
      )}
      style={{ boxShadow: SEGMENTED_TRACK_SUNKEN_SHADOW }}
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
          // `ghost` is the closest resting state (transparent, no border) — the
          // overrides below only unset the pill's fixed height, its horizontal
          // layout, and its hover tint, which is `bg-surface-sunken` and would
          // be invisible against the sunken track this now sits in.
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
              // 44px is the floor, not the look: the cell is the hit target
              // (WCAG 2.2 AA 2.5.8) and the whole strip is ~54px tall.
              'h-auto min-h-[44px] w-full flex-col gap-[3px] border-0 px-0.5 py-1.5 font-normal',
              'focus-visible:ring-offset-elevated',
              // Selected — the ONE thing that lifts off the well.
              dayIsSelected && 'bg-accent-650 text-text-on-accent hover:bg-accent-750',
              // Today (not selected) — a quiet accent ring, no fill: a second
              // fill on the track would compete with the thumb.
              !dayIsSelected && dayIsToday && 'ring-2 ring-accent-300',
              // Resting — transparent on the track. `ghost`'s own hover is
              // `bg-surface-sunken`, i.e. the track's own colour: invisible.
              !dayIsSelected && 'hover:bg-surface/70',
            )}
            style={dayIsSelected ? { boxShadow: SELECTED_THUMB_SHADOW } : undefined}
          >
            {/* Day-of-week eyebrow. */}
            <span
              className={cn(
                'font-fw-display text-eyebrow font-bold uppercase leading-none',
                dayIsSelected
                  ? 'text-text-on-accent/90'
                  : dayIsToday
                    ? 'text-accent-700'
                    : // PAST: quieted by ROLE, not by alpha. `text-text-tertiary/60`
                      // resolved to #5b5854 on the sunken well — 2.72:1, well under
                      // AA. text-tertiary is already the dimmest AA-safe ink token
                      // (>=4.5:1 on canvas/surface/sunken by construction), so
                      // fading it further just breaks it; past days read one role
                      // quieter than upcoming ones instead.
                      'text-text-tertiary',
              )}
            >
              {format(day, 'EEE')}
            </span>

            {/* Day number — Fragment-Mono tabular-nums. */}
            <span
              className={cn(
                'font-fw-mono text-body-sm font-semibold leading-none tabular-nums',
                dayIsSelected
                  ? 'text-text-on-accent'
                  : dayIsPast
                    ? // The DATE is the data in this cell, so it must outrank its
                      // own weekday label. At tertiary/70 (3.43:1) it was landing
                      // within a hair of the label above it — two equally dim
                      // greys, no hierarchy. Secondary keeps past days recessive
                      // relative to upcoming (text-primary) while restoring the
                      // number-over-label order.
                      'text-text-secondary'
                    : 'text-text-primary',
              )}
            >
              {format(day, 'd')}
            </span>

            {/* Density dots — up to 3 type-toned (capped at 3). The fixed 3px
                box reserves the row's height whether or not there are dots, so
                a day with events is never taller than one without. */}
            <span aria-hidden className="flex h-[3px] items-center gap-[3px]">
              {dotTypes.map((t, i) => (
                <span
                  key={`${key}-${t}-${i}`}
                  className={cn(
                    'h-[3px] w-[3px] rounded-full',
                    dayIsSelected ? 'bg-text-on-accent/85' : TYPE_DOT_CLASS[t] ?? DEFAULT_DOT_CLASS,
                    dayIsPast && !dayIsSelected && 'opacity-50',
                  )}
                />
              ))}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
