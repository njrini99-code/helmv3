'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayDayTimeGrid — the Day view
 * ----------------------------------------------------------------------------
 * One day as a real time grid: the full 24 hours on a 64px-per-hour column,
 * every timed event a solid block in its type's colour whose top and height
 * ARE its start and duration, all-day events in a band above the hours, and,
 * on today, a green now-line with the current time in the gutter.
 *
 * Contrast comes from formatting, not a coloured band: the header and the
 * all-day band sit a step sunken on the cream card, the day's figures are big
 * semibold numbers against small tertiary labels, and a strong hairline closes
 * the header. Green appears only as today's marks (the date disc, the
 * now-line) and the primary action.
 *
 * It opens with an hour of lead above what matters: now (or the event that is
 * on) today, or the next event when it would not fit under now or it is still
 * before dawn; the first event on any other day, 7 AM on an empty one; and on
 * a today that is all done, the day that happened (`scrollAnchorMinute`).
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
 *     height (plus a 2px gap) so a short event never hides under the next.
 *   · Anything that depends on the current minute (the now-line, "Up next")
 *     waits for the mount clock, so the server render and the first client
 *     render are identical (React #418).
 *
 * The geometry, clock and block live in `./timeGrid` (shared with Week).
 * ========================================================================== */

import * as React from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button, PressTarget } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { eventDaySpan, formatEventTime, zonedMinuteOfDay } from '@/lib/calendar/timezone';
import { EVENT_BAR, EVENT_SURFACE, eventToneVars, typeIcon } from './eventPresentation';
import {
  ColumnGround,
  GRID_CONTENT_PX,
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
  scrollAnchorMinute,
  useFittedTimeScroller,
  useMinuteClock,
  type DayMinutes,
} from './timeGrid';

export {
  BLOCK_GAP_PX,
  DAY_GRID_HOUR_PX,
  MIN_BLOCK_PX,
  dayGridRangeLabel,
  layoutDayBlocks,
  scrollAnchorMinute,
  type PlacedBlock,
} from './timeGrid';

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

function relativeHeading(day: Date, nowRef?: Date): string | null {
  if (!nowRef) return null;
  const diff = differenceInCalendarDays(day, nowRef);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return null;
}

const weekdayLong = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const fullDay = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** A figure and its unit on one baseline: "2 events", "3h 30m scheduled". */
function DayFigure({ value, label, testId }: { value: React.ReactNode; label: string; testId: string }) {
  return (
    <p data-testid={testId} className="flex items-baseline gap-1.5 font-fw-sans">
      <span className="text-h2 tabular-nums text-text-primary">{value}</span>{' '}
      <span className="text-caption text-text-tertiary">{label}</span>
    </p>
  );
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

  const current = nowMin !== null ? blocks.find((b) => b.startMin <= nowMin && nowMin < b.endMin) : undefined;
  const next = nowMin !== null ? blocks.find((b) => b.startMin > nowMin) : undefined;

  // Open where the day is happening (the next event, before dawn). While the
  // range is still loading an empty day anchors provisionally, and anchors
  // again once its events arrive.
  const anchorKey = eventCount === 0 && isLoadingRange ? `${focusKey}:pending` : focusKey;
  const { scrollRef, fitHeight } = useFittedTimeScroller(
    anchorKey,
    (visibleMin) => {
      const live = new Date();
      const liveMin = dayKeyInZone(live, timezone) === focusKey ? zonedMinuteOfDay(live, timezone) : null;
      return scrollAnchorMinute(blocks, liveMin, visibleMin);
    },
    isCoach,
  );

  const relative = relativeHeading(focusDate, nowRef);
  const heading = relative ?? weekdayLong.format(focusDate);
  const dateLine = relative ? fullDay.format(focusDate) : monthDay.format(focusDate);
  const isToday = relative === 'Today';

  let status: React.ReactNode = null;
  if (nowMin !== null && blocks.length > 0) {
    if (current) {
      status = (
        <>
          <span className="shrink-0 text-caption text-text-tertiary">Now</span>{' '}
          <span className="min-w-0 truncate text-body-sm font-semibold text-text-primary">{current.event.title}</span>
        </>
      );
    } else if (next) {
      status = (
        <>
          <span className="shrink-0 text-caption text-text-tertiary">Up next</span>{' '}
          <span className="min-w-0 truncate text-body-sm font-semibold text-text-primary">{next.event.title}</span>
{' '}
          <span className="shrink-0 text-body-sm tabular-nums text-text-secondary">
            at {formatEventTime(next.event.start_time || next.event.start_date, timezone)}
          </span>
        </>
      );
    } else {
      status = <span className="text-body-sm font-semibold text-text-primary">All done for today</span>;
    }
  } else if (blocks.length > 0) {
    const first = blocks.reduce((a, b) => (b.startMin < a.startMin ? b : a));
    const last = blocks.reduce((a, b) => (b.endMin > a.endMin ? b : a));
    const firstLabel = first.continuesBefore ? '12 AM' : formatEventTime(first.event.start_time || first.event.start_date, timezone);
    const lastIso = last.event.end_time || last.event.end_date;
    const lastLabel = last.continuesAfter || !lastIso ? null : formatEventTime(lastIso, timezone);
    const spans = lastLabel && lastLabel !== firstLabel;
    status = (
      <>
        <span className="shrink-0 text-caption text-text-tertiary">{spans ? 'From' : 'Starts'}</span>{' '}
        <span className="min-w-0 truncate text-body-sm font-semibold tabular-nums text-text-primary">
          {spans ? `${firstLabel} to ${lastLabel}` : firstLabel}
        </span>
      </>
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
      {/* ── The day's headline: a sunken band, big figures, small labels ─── */}
      <header
        className={cn(
          'flex flex-wrap items-center gap-x-8 gap-y-3 border-b bg-surface-sunken px-4 py-3 md:px-5',
          allDay.length > 0 ? 'border-border-subtle' : 'border-border-strong',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-full font-fw-sans text-h3 tabular-nums',
              isToday
                ? 'bg-accent-fill text-text-on-accent-fill'
                : 'bg-surface text-text-primary [box-shadow:inset_0_0_0_1px_var(--fw-color-border-subtle)]',
            )}
          >
            {focusDate.getDate()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-fw-sans text-h3 text-text-primary">{heading}</h2>
            <p className="truncate font-fw-sans text-caption text-text-tertiary">{dateLine}</p>
          </div>
        </div>

        {eventCount > 0 ? (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <DayFigure testId="day-grid-count" value={eventCount} label={eventCount === 1 ? 'event' : 'events'} />
            {bookedMinutes > 0 ? (
              <DayFigure testId="day-grid-booked" value={formatDuration(bookedMinutes)} label="scheduled" />
            ) : null}
          </div>
        ) : (
          <p className="font-fw-sans text-body-sm text-text-secondary">
            {isLoadingRange ? 'Loading the day…' : 'Nothing on the books'}
          </p>
        )}

        {status ? (
          <p
            data-testid="day-grid-status"
            className="flex min-w-0 max-w-full basis-full items-baseline gap-1.5 font-fw-sans md:ml-auto md:max-w-[45%] md:basis-auto"
          >
            {status}
          </p>
        ) : eventCount === 0 && !isLoadingRange && isCoach && onCreateEvent ? (
          <Button variant="secondary" size="sm" onClick={onCreateEvent} className="md:ml-auto">
            Schedule something
          </Button>
        ) : null}
      </header>

      {/* ── All-day band: a sunken well above the hours ───────────────────── */}
      {allDay.length > 0 ? (
        <div className="flex items-start border-b border-border-strong bg-surface-sunken py-2 pr-2 md:pr-3">
          <span className="w-[52px] shrink-0 pr-2 pt-3 text-right font-fw-sans text-caption text-text-tertiary md:w-[60px]">
            All day
          </span>
          <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {allDay.map(({ event, dayIndex, dayCount }) => {
              const Icon = typeIcon(event.event_type);
              const cancelled = event.status === 'cancelled';
              return (
                <li key={event.id} className="min-w-0 max-w-full">
                  <PressTarget
                    onClick={onEventClick ? () => onEventClick(event) : undefined}
                    aria-label={`${event.title}, all day${dayCount > 1 ? `, day ${dayIndex} of ${dayCount}` : ''}${event.location ? `, ${event.location}` : ''}`}
                    className={cn(
                      'relative flex min-h-11 max-w-full items-center gap-2 overflow-clip rounded-fw-sm py-1.5 pl-3.5 pr-3 text-left',
                      EVENT_SURFACE,
                    )}
                    style={eventToneVars(event.event_type, { cancelled })}
                  >
                    <span aria-hidden className={EVENT_BAR} />
                    <Icon className="h-4 w-4 shrink-0 text-[color:var(--ev-ink)]" aria-hidden />
                    <span
                      className={cn(
                        'min-w-0 truncate font-fw-sans text-sm font-semibold leading-5',
                        cancelled ? 'text-text-secondary line-through' : 'text-text-primary',
                      )}
                    >
                      {event.title}
                    </span>
                    {dayCount > 1 ? (
                      <span className="shrink-0 font-fw-sans text-body-sm tabular-nums text-text-secondary">
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
        <div className="relative flex" style={{ height: GRID_CONTENT_PX }}>
          <HourGutter nowMin={nowMin} clock={clock} timezone={timezone} />
          <div className="relative min-w-0 flex-1 border-l border-border-subtle" style={{ marginTop: GRID_PAD_PX, height: GRID_HEIGHT_PX }}>
            <ColumnGround />
            {blocks.map((block) => (
              <TimeBlock
                key={block.event.id}
                block={block}
                timezone={timezone}
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
