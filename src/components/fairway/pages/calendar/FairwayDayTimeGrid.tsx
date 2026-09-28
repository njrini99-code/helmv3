'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayDayTimeGrid — the Day view
 * ----------------------------------------------------------------------------
 * One day as a real time grid: the full 24 hours on a 64px-per-hour column,
 * every timed event a block whose top and height ARE its start and duration,
 * all-day events in a band above the hours, and — on today — a green now-line
 * with the current time in the gutter. It opens scrolled to now (today) or to
 * the first event (any other day), once per day it shows.
 *
 * Correctness rules this file lives by:
 *   · Every position and label comes from the TEAM's clock
 *     (`zonedMinuteOfDay` / `formatEventTime` with the team zone), never the
 *     device's `getHours()`, so a coach travelling west still sees practice at
 *     2:00 PM where the team plays it.
 *   · The day an event belongs to is `eventDaySpan`, the same helper the
 *     agenda and month grid use, so a two-day tournament shows on both days
 *     and nowhere else.
 *   · Overlapping events share the column in side-by-side lanes; a block is
 *     never shorter than a 44px tap target and the layout reserves that
 *     height so a short event never hides under the next one.
 *   · Anything that depends on the current minute (the now-line, "up next",
 *     past blocks receding) waits for the mount clock, so the server render
 *     and the first client render are identical (React #418).
 *
 * The geometry, clock and block live in `./timeGrid` (shared with Week).
 * ========================================================================== */

import * as React from 'react';
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button, PressTarget } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { eventDaySpan, formatEventTime, zonedMinuteOfDay } from '@/lib/calendar/timezone';
import { typeIcon, typeTone } from './eventPresentation';
import {
  ColumnGround,
  GRID_HEIGHT_PX,
  GRID_PAD_PX,
  HourGutter,
  NowLine,
  TimeBlock,
  dayKeyInZone,
  formatDuration,
  layoutDayBlocks,
  localDayKey,
  minutesOnDay,
  useFittedTimeScroller,
  useMinuteClock,
  type DayMinutes,
} from './timeGrid';

export { DAY_GRID_HOUR_PX, dayGridRangeLabel, layoutDayBlocks, type PlacedBlock } from './timeGrid';

export interface FairwayDayTimeGridProps {
  events: CalendarEvent[];
  /** The day on screen: a team-local midnight (see FairwayCalendar). */
  focusDate: Date;
  /** Parent-owned reference day (serverNow → nowRef), for Today/Tomorrow. */
  nowRef?: Date;
  isCoach: boolean;
  userRsvpStatuses?: Map<string, RSVPStatus>;
  timezone?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  /** Coach-only "Schedule something" on an empty day. */
  onCreateEvent?: () => void;
  /** The visible range is still loading: don't claim the day is empty yet. */
  isLoadingRange?: boolean;
  className?: string;
}

function dayHeading(day: Date, nowRef?: Date): string {
  if (nowRef) {
    const diff = differenceInCalendarDays(day, nowRef);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
  }
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(day);
}

export function FairwayDayTimeGrid({
  events,
  focusDate,
  nowRef,
  isCoach,
  userRsvpStatuses,
  timezone,
  onEventClick,
  onCreateEvent,
  isLoadingRange = false,
  className,
}: FairwayDayTimeGridProps) {
  const clock = useMinuteClock();
  const focusKey = localDayKey(focusDate);

  // Every event that RUNS on this day (a multi-day event shows on each day).
  const { allDay, blocks, bookedMinutes } = React.useMemo(() => {
    const allDayEvents: Array<{ event: CalendarEvent; dayIndex: number; dayCount: number }> = [];
    const timed: DayMinutes[] = [];
    for (const event of events) {
      const span = eventDaySpan(event, timezone);
      if (!span) continue;
      // Both sides are team-local midnights, so plain comparison is exact.
      if (span.first.getTime() > focusDate.getTime() || span.last.getTime() < focusDate.getTime()) continue;
      if (event.all_day) {
        allDayEvents.push({
          event,
          dayIndex: differenceInCalendarDays(focusDate, span.first) + 1,
          dayCount: differenceInCalendarDays(span.last, span.first) + 1,
        });
        continue;
      }
      const onDay = minutesOnDay(event, focusDate, timezone);
      if (onDay) timed.push(onDay);
    }
    const placed = layoutDayBlocks(timed);
    return {
      allDay: allDayEvents,
      blocks: placed,
      bookedMinutes: placed.reduce((sum, b) => sum + (b.endMin - b.startMin), 0),
    };
  }, [events, focusDate, timezone]);

  const eventCount = allDay.length + blocks.length;

  // The current minute on the team clock — only once mounted, and only when
  // the day on screen IS the team's today.
  const nowMin = clock && dayKeyInZone(clock, timezone) === focusKey ? zonedMinuteOfDay(clock, timezone) : null;
  const dayIsPast = nowRef ? startOfDay(focusDate).getTime() < startOfDay(nowRef).getTime() : false;

  const current = nowMin !== null ? blocks.find((b) => b.startMin <= nowMin && nowMin < b.endMin) : undefined;
  const next = nowMin !== null ? blocks.find((b) => b.startMin > nowMin) : undefined;

  // Open where the day is happening: now (today), else the first event, else 7 AM.
  const { scrollRef, fitHeight } = useFittedTimeScroller(focusKey, () => {
    if (dayKeyInZone(new Date(), timezone) === focusKey) return zonedMinuteOfDay(new Date(), timezone) - 90;
    const firstStart = blocks.reduce((min, b) => Math.min(min, b.startMin), Number.POSITIVE_INFINITY);
    return Number.isFinite(firstStart) ? firstStart - 45 : 7 * 60;
  });

  const heading = dayHeading(focusDate, nowRef);
  const summary =
    eventCount === 0
      ? isLoadingRange
        ? 'Loading the day…'
        : 'Nothing on the books'
      : `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`;

  let status: React.ReactNode = null;
  if (nowMin !== null && blocks.length > 0) {
    if (current) {
      status = (
        <>
          <span className="font-semibold">Now</span> · <span className="truncate">{current.event.title}</span>
        </>
      );
    } else if (next) {
      status = (
        <>
          <span className="font-semibold">Up next</span> · <span className="truncate">{next.event.title}</span>
          <span className="shrink-0 tabular-nums">, {formatEventTime(next.event.start_time || next.event.start_date, timezone)}</span>
        </>
      );
    } else {
      status = <span className="font-semibold">All done for today</span>;
    }
  } else if (blocks.length > 0) {
    const first = blocks.reduce((a, b) => (b.startMin < a.startMin ? b : a));
    const last = blocks.reduce((a, b) => (b.endMin > a.endMin ? b : a));
    const firstLabel = first.continuesBefore ? '12 AM' : formatEventTime(first.event.start_time || first.event.start_date, timezone);
    const lastIso = last.event.end_time || last.event.end_date;
    const lastLabel = last.continuesAfter || !lastIso ? null : formatEventTime(lastIso, timezone);
    status = (
      <span className="tabular-nums">
        {lastLabel && lastLabel !== firstLabel ? `${firstLabel} to ${lastLabel}` : `Starts ${firstLabel}`}
      </span>
    );
  }

  return (
    <section
      aria-label={`${heading}'s schedule`}
      data-testid="day-time-grid"
      className={cn(
        'overflow-hidden rounded-card border border-border-subtle bg-surface',
        '[box-shadow:inset_0_1px_0_oklch(1_0_0/0.55),var(--fw-shadow-soft)]',
        className,
      )}
    >
      {/* ── The day's headline on the deep green plinth ─────────────────── */}
      <header className="fw-plinth-green flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 md:px-5">
        <div className="min-w-0 flex-1">
          <p className="font-fw-sans text-microlabel font-semibold uppercase tracking-[0.08em] text-text-secondary">
            {heading}
          </p>
          <p className="font-fw-sans text-h3 text-text-primary">
            {summary}
            {bookedMinutes > 0 ? (
              <span className="ml-2 font-fw-sans text-body-sm font-medium tabular-nums text-text-secondary">
                {formatDuration(bookedMinutes)} scheduled
              </span>
            ) : null}
          </p>
        </div>
        {status ? (
          <p
            data-testid="day-grid-status"
            className="flex min-w-0 max-w-full items-center gap-1 rounded-full bg-surface-sunken px-3 py-1.5 font-fw-sans text-body-sm text-text-primary md:max-w-[55%]"
          >
            {status}
          </p>
        ) : eventCount === 0 && !isLoadingRange && isCoach && onCreateEvent ? (
          <span data-slot="view-header-actions" className="shrink-0">
            <Button variant="secondary" size="sm" onClick={onCreateEvent}>
              Schedule something
            </Button>
          </span>
        ) : null}
      </header>

      {/* ── All-day band ─────────────────────────────────────────────────── */}
      {allDay.length > 0 ? (
        <div className="flex items-start gap-2 border-b border-border-subtle bg-surface-sunken px-2 py-2 md:px-3">
          <span className="w-[44px] shrink-0 pt-2 text-right font-fw-sans text-microlabel font-semibold uppercase tracking-[0.06em] text-text-tertiary md:w-[52px]">
            All day
          </span>
          <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {allDay.map(({ event, dayIndex, dayCount }) => {
              const tone = typeTone(event.event_type);
              const Icon = typeIcon(event.event_type);
              const cancelled = event.status === 'cancelled';
              return (
                <li key={event.id} className="min-w-0 max-w-full">
                  <PressTarget
                    onClick={onEventClick ? () => onEventClick(event) : undefined}
                    aria-label={`${event.title}, all day${dayCount > 1 ? `, day ${dayIndex} of ${dayCount}` : ''}${event.location ? `, ${event.location}` : ''}`}
                    className="flex min-h-9 max-w-full items-center gap-2 rounded-fw-md px-3 py-1.5 text-left [@media(pointer:coarse)]:min-h-11 [@media(hover:hover)]:hover:-translate-y-px"
                    style={{
                      backgroundColor: tone.bg,
                      color: tone.ink,
                      boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${tone.ink} 24%, transparent), 0 1px 2px oklch(0.3 0.03 70 / 0.10)`,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className={cn('min-w-0 truncate font-fw-sans text-body-sm font-semibold', cancelled && 'line-through')}>
                      {event.title}
                    </span>
                    {dayCount > 1 ? (
                      <span className="shrink-0 font-fw-sans text-caption tabular-nums opacity-80">
                        Day {dayIndex} of {dayCount}
                      </span>
                    ) : null}
                  </PressTarget>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ── The hours ────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        data-testid="day-grid-scroller"
        className="relative h-[62dvh] min-h-[340px] overflow-y-auto md:h-[min(66dvh,760px)]"
        style={fitHeight ? { height: fitHeight } : undefined}
      >
        <div className="relative flex" style={{ height: GRID_HEIGHT_PX + GRID_PAD_PX * 2 }}>
          <HourGutter nowMin={nowMin} clock={clock} timezone={timezone} />
          <div className="relative min-w-0 flex-1 border-l border-border-subtle" style={{ marginTop: GRID_PAD_PX, height: GRID_HEIGHT_PX }}>
            <ColumnGround />
            {blocks.map((block) => (
              <TimeBlock
                key={block.event.id}
                block={block}
                timezone={timezone}
                isPast={dayIsPast || (nowMin !== null && block.endMin <= nowMin && block.endMin > block.startMin)}
                isNow={current?.event.id === block.event.id}
                rsvp={!isCoach ? userRsvpStatuses?.get(block.event.id) ?? null : null}
                onClick={onEventClick}
              />
            ))}
            {nowMin !== null && clock ? <NowLine nowMin={nowMin} clock={clock} timezone={timezone} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
