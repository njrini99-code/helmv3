'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayMonthGrid — native month grid (player view)
 * ----------------------------------------------------------------------------
 * The Fairway-native Month view, replacing the legacy PremiumCalendarClient grid
 * for PLAYERS (read-only). Presentation-only grid over the events array: opens
 * the same Fairway detail drawer and reuses the exact event_type → tone mapping
 * (typeMeta) the agenda cards use. NO writes, NO new data.
 *
 * AVAILABILITY OVERLAY: when the coach selects team members, the parent passes
 * `overlays` (each selected player's busy periods, color-coded). The grid then
 * renders those colored chips INSTEAD of team events so the coach sees the
 * selected players' schedules / common free time. Overlay colors are the legacy
 * PLAYER_COLORS (applied via inline style — they're hex, not Tailwind tokens).
 *
 * Coaches keep the legacy engine for the normal (un-filtered) Week/Month — this
 * grid is mounted only on the player branch and the coach availability branch.
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
import { Button } from '@/components/ui/button';
import type { FwStatusTone } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { typeMeta } from './FairwayEventCard';

/** A color-coded busy period for the coach availability overlay. */
export interface ScheduleOverlay {
  id: string;
  start: string; // ISO
  end?: string | null;
  title: string;
  kind: 'event' | 'class' | 'blocked';
  playerName: string;
  color: { bg: string; light: string; border: string; name: string };
}

export interface FairwayMonthGridProps {
  events: CalendarEvent[];
  /** The month to render (any day within it). */
  focusDate: Date;
  /** Parent-owned "today" (seeded from serverNow then promoted client-side). */
  nowRef?: Date;
  /** Coach availability overlays — when present, replace team events. */
  overlays?: ScheduleOverlay[];
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
  warning: 'bg-fw-warning-bg text-fw-warning-ink hover:bg-warm-200/60',
  danger: 'bg-fw-danger-bg text-fw-danger hover:bg-fw-danger/10',
  neutral: 'bg-surface-sunken text-text-secondary hover:bg-surface-tint',
  info: 'bg-surface-sunken text-text-secondary hover:bg-surface-tint',
};

const MAX_CHIPS = 3;

function eventStart(e: CalendarEvent): string | null {
  return e.start_time || e.start_date || null;
}

type CellItem =
  | { kind: 'event'; at: number; event: CalendarEvent }
  | { kind: 'overlay'; at: number; overlay: ScheduleOverlay };

export function FairwayMonthGrid({
  events,
  focusDate,
  nowRef,
  overlays,
  onEventClick,
  onSelectDate,
}: FairwayMonthGridProps) {
  const overlayMode = (overlays?.length ?? 0) > 0;

  // 6-week grid spanning the focused month (weeks start Sunday).
  const days = React.useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(focusDate), { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(focusDate), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [focusDate]);

  // Bucket events + overlays by local day key, merged + time-sorted per day.
  const byDay = React.useMemo(() => {
    const map = new Map<string, CellItem[]>();
    const push = (key: string, item: CellItem) => {
      const arr = map.get(key);
      if (arr) arr.push(item);
      else map.set(key, [item]);
    };
    if (overlayMode) {
      for (const o of overlays!) {
        if (!o.start) continue;
        const at = new Date(o.start).getTime();
        push(format(new Date(o.start), 'yyyy-MM-dd'), { kind: 'overlay', at, overlay: o });
      }
    } else {
      for (const e of events) {
        const s = eventStart(e);
        if (!s) continue;
        const at = new Date(s).getTime();
        push(format(new Date(s), 'yyyy-MM-dd'), { kind: 'event', at, event: e });
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.at - b.at);
    return map;
  }, [events, overlays, overlayMode]);

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
          const items = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, focusDate);
          const isToday = nowRef ? isSameDay(day, nowRef) : false;
          const overflow = items.length - MAX_CHIPS;

          return (
            <div
              key={key}
              className={cn(
                'flex min-h-[96px] flex-col gap-1 p-1.5 md:min-h-[116px]',
                inMonth ? 'bg-surface' : 'bg-surface-sunken/50',
              )}
            >
              {/* Day number */}
              <Button
                type="button"
                variant="ghost"
                haptic="none"
                onClick={onSelectDate ? () => onSelectDate(day) : undefined}
                aria-label={format(day, 'EEEE, MMMM d')}
                className={cn(
                  'flex h-6 w-6 min-h-0 p-0 flex-shrink-0 items-center justify-center self-start rounded-full font-fw-mono text-caption font-medium tabular-nums transition-colors',
                  isToday
                    ? 'bg-accent-500 text-text-on-accent'
                    : inMonth
                      ? 'text-text-secondary hover:bg-surface-tint'
                      : 'text-text-tertiary hover:bg-surface-tint',
                )}
                suppressHydrationWarning
              >
                {format(day, 'd')}
              </Button>

              {/* Chips */}
              <div className="flex flex-col gap-1">
                {items.slice(0, MAX_CHIPS).map((item) => {
                  if (item.kind === 'overlay') {
                    const o = item.overlay;
                    return (
                      <span
                        key={o.id}
                        title={`${o.playerName} · ${o.title}`}
                        className="flex items-center gap-1 truncate rounded-sm px-1.5 py-1 text-left font-fw-sans text-microlabel font-medium leading-tight text-text-primary"
                        style={{ backgroundColor: o.color.light }}
                      >
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: o.color.bg }}
                        />
                        {o.kind !== 'blocked' ? (
                          <span className="mr-0.5 font-fw-mono tabular-nums opacity-70" suppressHydrationWarning>
                            {format(new Date(o.start), 'h:mm')}
                          </span>
                        ) : null}
                        <span className="truncate">{o.title}</span>
                      </span>
                    );
                  }
                  const e = item.event;
                  const { tone } = typeMeta(e.event_type);
                  // Cancelled events get the same distinct cue as the Agenda/Week
                  // card (FairwayEventCard) — danger tint + strike-through —
                  // instead of rendering identically to a live event (2026-07-10
                  // calendar-travel audit). No room for a second badge in a
                  // compact month chip, so the tint swap carries the signal.
                  const isCancelled = e.status === 'cancelled';
                  return (
                    <Button
                      key={e.id}
                      type="button"
                      variant="ghost"
                      haptic="none"
                      onClick={onEventClick ? () => onEventClick(e) : undefined}
                      title={isCancelled ? `${e.title} (cancelled)` : e.title}
                      className={cn(
                        'block h-auto min-h-0 truncate rounded-sm px-1.5 py-1 text-left font-fw-sans text-microlabel font-medium leading-tight transition-colors',
                        isCancelled ? TONE_CHIP.danger : TONE_CHIP[tone],
                        isCancelled && 'line-through decoration-2',
                      )}
                    >
                      {!e.all_day && eventStart(e) ? (
                        <span className="mr-1 font-fw-mono tabular-nums opacity-70" suppressHydrationWarning>
                          {format(new Date(eventStart(e)!), 'h:mm')}
                        </span>
                      ) : null}
                      {e.title}
                    </Button>
                  );
                })}

                {overflow > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    haptic="none"
                    onClick={onSelectDate ? () => onSelectDate(day) : undefined}
                    className="h-auto min-h-0 px-1.5 text-left font-fw-sans text-microlabel font-medium text-text-tertiary transition-colors hover:text-text-secondary"
                  >
                    +{overflow} more
                  </Button>
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
