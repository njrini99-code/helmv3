'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayMonthGrid — native month grid (player view)
 * ----------------------------------------------------------------------------
 * The Fairway-native Month view, replacing the legacy PremiumCalendarClient grid
 * for PLAYERS (read-only). The legacy grid brought its own member-filter rail,
 * "+ Add Event" button, and a duplicate Day/Week/Month toggle — chrome a player
 * neither needs nor should see, and which doubled the Fairway shell's own hero +
 * segmented. This is a presentation-only grid over the events array: it opens the
 * same Fairway detail drawer (openDrawerForEvent) and reuses the exact event_type
 * → tone mapping (typeMeta) the agenda cards use. NO writes, NO new data.
 *
 * Coaches keep the legacy engine (create / drag-reschedule / recurring) — this
 * grid is mounted only on the player branch of FairwayCalendar.
 * ========================================================================== */

import * as React from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from 'date-fns';

import { cn } from '@/lib/utils';
import type { FwStatusTone } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { typeMeta } from './FairwayEventCard';

export interface FairwayMonthGridProps {
  events: CalendarEvent[];
  /** The month to render (any day within it). */
  focusDate: Date;
  /** Parent-owned "today" (seeded from serverNow then promoted client-side). */
  nowRef?: Date;
  /** Click an event chip → open the Fairway detail drawer. */
  onEventClick?: (event: CalendarEvent) => void;
  /** Click a day (number / empty cell / "+N more") → jump to that day. */
  onSelectDate?: (date: Date) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** event_type tone → compact month-chip tint (mirrors the StatusPill tints). */
const TONE_CHIP: Record<FwStatusTone, string> = {
  accent: 'bg-accent-50 text-accent-700 hover:bg-accent-100',
  success: 'bg-fw-success-bg text-accent-700 hover:bg-accent-100',
  warning: 'bg-fw-warning-bg text-warm-800 hover:bg-warm-200/60',
  danger: 'bg-fw-danger-bg text-fw-danger hover:bg-fw-danger/10',
  neutral: 'bg-surface-sunken text-text-secondary hover:bg-surface-tint',
  info: 'bg-surface-sunken text-text-secondary hover:bg-surface-tint',
};

const MAX_CHIPS = 3;

function eventStart(e: CalendarEvent): string | null {
  return e.start_time || e.start_date || null;
}

export function FairwayMonthGrid({
  events,
  focusDate,
  nowRef,
  onEventClick,
  onSelectDate,
}: FairwayMonthGridProps) {
  // 6-week grid spanning the focused month (weeks start Sunday).
  const days = React.useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(focusDate), { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(focusDate), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [focusDate]);

  // Bucket events by local day key, each bucket sorted by start time.
  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const s = eventStart(e);
      if (!s) continue;
      const key = format(new Date(s), 'yyyy-MM-dd');
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(eventStart(a)!).getTime() - new Date(eventStart(b)!).getTime());
    }
    return map;
  }, [events]);

  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-surface shadow-flat">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-sunken">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2.5 text-center font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.08em] text-text-tertiary"
          >
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d.charAt(0)}</span>
          </div>
        ))}
      </div>

      {/* Day cells — hairline grid via gap-px on a border-tinted track */}
      <div className="grid grid-cols-7 gap-px bg-border-subtle">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, focusDate);
          const isToday = nowRef ? isSameDay(day, nowRef) : false;
          const overflow = dayEvents.length - MAX_CHIPS;

          return (
            <div
              key={key}
              className={cn(
                'flex min-h-[96px] flex-col gap-1 p-1.5 md:min-h-[116px]',
                inMonth ? 'bg-surface' : 'bg-surface-sunken/50',
              )}
            >
              {/* Day number */}
              <button
                type="button"
                onClick={onSelectDate ? () => onSelectDate(day) : undefined}
                aria-label={format(day, 'EEEE, MMMM d')}
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center self-start rounded-full font-fw-mono text-caption font-medium tabular-nums transition-colors',
                  isToday
                    ? 'bg-accent-500 text-text-on-accent'
                    : inMonth
                      ? 'text-text-secondary hover:bg-surface-tint'
                      : 'text-text-tertiary hover:bg-surface-tint',
                )}
                suppressHydrationWarning
              >
                {format(day, 'd')}
              </button>

              {/* Event chips */}
              <div className="flex flex-col gap-1">
                {dayEvents.slice(0, MAX_CHIPS).map((e) => {
                  const { tone } = typeMeta(e.event_type);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={onEventClick ? () => onEventClick(e) : undefined}
                      title={e.title}
                      className={cn(
                        'truncate rounded-[6px] px-1.5 py-1 text-left font-fw-sans text-[11px] font-medium leading-tight transition-colors',
                        TONE_CHIP[tone],
                      )}
                    >
                      {!e.all_day && eventStart(e) ? (
                        <span className="mr-1 font-fw-mono tabular-nums opacity-70" suppressHydrationWarning>
                          {format(new Date(eventStart(e)!), 'h:mm')}
                        </span>
                      ) : null}
                      {e.title}
                    </button>
                  );
                })}

                {overflow > 0 ? (
                  <button
                    type="button"
                    onClick={onSelectDate ? () => onSelectDate(day) : undefined}
                    className="px-1.5 text-left font-fw-sans text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
                  >
                    +{overflow} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FairwayMonthGrid;
