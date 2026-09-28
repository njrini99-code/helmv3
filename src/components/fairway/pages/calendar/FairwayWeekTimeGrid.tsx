'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayWeekTimeGrid — the Week view (md and up)
 * ----------------------------------------------------------------------------
 * Seven day columns on one shared time axis: a deep-green header row names
 * each day (today's date in a cream disc) and opens it in Day on a press;
 * all-day events run as bars across the days they cover (a two-day
 * tournament is ONE bar over Friday and Saturday); timed events are blocks
 * sized by duration, tinted by type; today's column is washed green and
 * carries the now-line. A phone keeps the week as a list (see
 * FairwayCalendar) — seven 45px columns are not a schedule.
 *
 * Day membership is `eventDaySpan` and every position is the team clock,
 * exactly as in Day (`./timeGrid`).
 * ========================================================================== */

import * as React from 'react';
import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PressTarget } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { eventDaySpan, zonedMinuteOfDay } from '@/lib/calendar/timezone';
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
  type PlacedBlock,
} from './timeGrid';

export interface FairwayWeekTimeGridProps {
  events: CalendarEvent[];
  /** Any day in the week on screen (team-local midnight). */
  focusDate: Date;
  /** Parent-owned reference day (serverNow → nowRef). */
  nowRef?: Date;
  isCoach: boolean;
  userRsvpStatuses?: Map<string, RSVPStatus>;
  timezone?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  /** A day header press: open that day (the parent switches to Day). */
  onSelectDay?: (day: Date) => void;
  className?: string;
}

interface AllDaySegment {
  event: CalendarEvent;
  startCol: number;
  endCol: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Stack all-day bars into the fewest rows: longest first, first free row. */
export function layoutAllDaySegments(
  segments: ReadonlyArray<Omit<AllDaySegment, 'lane'>>,
): AllDaySegment[] {
  const sorted = [...segments].sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      (a.event.id < b.event.id ? -1 : 1),
  );
  const laneEnds: number[] = [];
  return sorted.map((segment) => {
    let lane = laneEnds.findIndex((end) => end < segment.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(segment.endCol);
    } else {
      laneEnds[lane] = segment.endCol;
    }
    return { ...segment, lane };
  });
}

const COLS = 'grid-cols-[52px_repeat(7,minmax(0,1fr))] md:grid-cols-[60px_repeat(7,minmax(0,1fr))]';

export function FairwayWeekTimeGrid({
  events,
  focusDate,
  nowRef,
  isCoach,
  userRsvpStatuses,
  timezone,
  onEventClick,
  onSelectDay,
  className,
}: FairwayWeekTimeGridProps) {
  const clock = useMinuteClock();
  const weekStart = React.useMemo(() => startOfWeek(focusDate, { weekStartsOn: 0 }), [focusDate]);
  const days = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekKey = localDayKey(weekStart);

  const { allDay, columns, bookedMinutes, eventCount, perDayCount } = React.useMemo(() => {
    const weekEnd = days[6]!;
    const segments: Array<Omit<AllDaySegment, 'lane'>> = [];
    const perDay: DayMinutes[][] = days.map(() => []);
    const counted = new Set<string>();
    const dayCounts = days.map(() => 0);
    for (const event of events) {
      const span = eventDaySpan(event, timezone);
      if (!span) continue;
      if (span.last.getTime() < weekStart.getTime() || span.first.getTime() > weekEnd.getTime()) continue;
      counted.add(event.id);
      const startCol = Math.max(0, differenceInCalendarDays(span.first, weekStart));
      const endCol = Math.min(6, differenceInCalendarDays(span.last, weekStart));
      for (let c = startCol; c <= endCol; c++) dayCounts[c] = (dayCounts[c] ?? 0) + 1;
      if (event.all_day) {
        segments.push({
          event,
          startCol,
          endCol,
          continuesBefore: span.first.getTime() < weekStart.getTime(),
          continuesAfter: span.last.getTime() > weekEnd.getTime(),
        });
        continue;
      }
      for (let c = startCol; c <= endCol; c++) {
        const onDay = minutesOnDay(event, days[c]!, timezone);
        if (onDay) perDay[c]!.push(onDay);
      }
    }
    const placedColumns = perDay.map((items) => layoutDayBlocks(items));
    return {
      allDay: layoutAllDaySegments(segments),
      columns: placedColumns,
      bookedMinutes: placedColumns.flat().reduce((sum, b) => sum + (b.endMin - b.startMin), 0),
      eventCount: counted.size,
      perDayCount: dayCounts,
    };
  }, [events, days, weekStart, timezone]);

  const todayKey = clock ? dayKeyInZone(clock, timezone) : nowRef ? localDayKey(nowRef) : null;
  const todayCol = todayKey ? days.findIndex((d) => localDayKey(d) === todayKey) : -1;
  const nowMin = clock && todayCol !== -1 ? zonedMinuteOfDay(clock, timezone) : null;
  const refTime = nowRef ? nowRef.getTime() : null;

  const { scrollRef, fitHeight } = useFittedTimeScroller(weekKey, () => {
    const liveToday = days.some((d) => localDayKey(d) === dayKeyInZone(new Date(), timezone));
    if (liveToday) return zonedMinuteOfDay(new Date(), timezone) - 90;
    const firstStart = columns.flat().reduce((min, b) => Math.min(min, b.startMin), Number.POSITIVE_INFINITY);
    return Number.isFinite(firstStart) ? firstStart - 45 : 7 * 60;
  });

  const laneCount = allDay.reduce((max, s) => Math.max(max, s.lane + 1), 0);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

  return (
    <section
      aria-label={`Week of ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(weekStart)}`}
      data-testid="week-time-grid"
      className={cn(
        'overflow-hidden rounded-card border border-border-subtle bg-surface',
        '[box-shadow:inset_0_1px_0_oklch(1_0_0/0.55),var(--fw-shadow-soft)]',
        className,
      )}
    >
      {/* ── Day headers on the deep green plinth ─────────────────────────── */}
      <div className={cn('fw-plinth-green grid', COLS)}>
        <div className="flex flex-col items-end justify-end px-2 pb-2 pt-3">
          <span className="font-fw-sans text-h3 tabular-nums leading-none text-text-primary">{eventCount}</span>
          <span className="mt-1 font-fw-sans text-caption-2 text-text-secondary">{eventCount === 1 ? 'event' : 'events'}</span>
        </div>
        {days.map((day, i) => {
          const isToday = i === todayCol;
          const isPast = refTime !== null && day.getTime() < refTime && !isToday;
          const count = perDayCount[i] ?? 0;
          return (
            <PressTarget
              key={localDayKey(day)}
              onClick={onSelectDay ? () => onSelectDay(day) : undefined}
              aria-label={`${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(day)}, ${count} ${count === 1 ? 'event' : 'events'}${isToday ? ', today' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              className={cn(
                'group flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-none border-l border-border-subtle px-1 py-2',
                '[@media(hover:hover)]:hover:bg-surface-sunken',
              )}
            >
              <span className={cn('font-fw-sans text-microlabel font-semibold uppercase tracking-[0.08em]', isPast ? 'text-text-tertiary' : 'text-text-secondary')}>
                {weekday.format(day)}
              </span>
              <span
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full font-fw-sans text-h3 tabular-nums leading-none',
                  isToday ? 'bg-accent-fill font-semibold text-text-on-accent-fill [box-shadow:0_2px_8px_oklch(0.2_0.05_150/0.35)]' : isPast ? 'text-text-tertiary' : 'text-text-primary',
                )}
              >
                {day.getDate()}
              </span>
              <span aria-hidden className="flex h-1.5 items-center gap-0.5">
                {Array.from({ length: Math.min(count, 4) }, (_, k) => (
                  <span key={k} className={cn('h-1.5 w-1.5 rounded-full', isPast ? 'bg-text-tertiary' : 'bg-text-secondary')} />
                ))}
              </span>
            </PressTarget>
          );
        })}
      </div>

      {/* ── All-day bars across the days they cover ──────────────────────── */}
      {laneCount > 0 ? (
        <div className={cn('grid border-b border-border-subtle bg-surface-sunken', COLS)}>
          <span className="self-center px-2 py-2 text-right font-fw-sans text-microlabel font-semibold uppercase tracking-[0.06em] text-text-tertiary">
            All day
          </span>
          <div
            className="col-span-7 grid grid-cols-7 gap-y-1 py-1.5"
            style={{ gridTemplateRows: `repeat(${laneCount}, minmax(36px, auto))` }}
          >
            {allDay.map((segment) => {
              const tone = typeTone(segment.event.event_type);
              const Icon = typeIcon(segment.event.event_type);
              const spanDays = segment.endCol - segment.startCol + 1;
              return (
                <PressTarget
                  key={segment.event.id}
                  onClick={onEventClick ? () => onEventClick(segment.event) : undefined}
                  aria-label={`${segment.event.title}, all day${spanDays > 1 ? `, ${spanDays} days` : ''}${segment.event.location ? `, ${segment.event.location}` : ''}`}
                  className={cn(
                    'mx-1 flex min-w-0 items-center gap-1.5 px-2.5 text-left [@media(hover:hover)]:hover:-translate-y-px',
                    segment.continuesBefore ? 'rounded-l-none' : 'rounded-l-fw-sm',
                    segment.continuesAfter ? 'rounded-r-none' : 'rounded-r-fw-sm',
                  )}
                  style={{
                    gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
                    gridRow: segment.lane + 1,
                    backgroundColor: tone.bg,
                    color: tone.ink,
                    boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${tone.ink} 24%, transparent), 0 1px 2px oklch(0.3 0.03 70 / 0.10)`,
                  }}
                >
                  {segment.continuesBefore ? <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  <span className="min-w-0 truncate font-fw-sans text-body-sm font-semibold">{segment.event.title}</span>
                  {segment.continuesAfter ? <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                </PressTarget>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── The hours ────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        data-testid="week-grid-scroller"
        className="relative h-[min(66dvh,760px)] min-h-[340px] overflow-y-auto"
        style={fitHeight ? { height: fitHeight } : undefined}
      >
        <div className="relative flex" style={{ height: GRID_HEIGHT_PX + GRID_PAD_PX * 2 }}>
          <HourGutter nowMin={nowMin} clock={clock} timezone={timezone} />
          <div className="grid min-w-0 flex-1 grid-cols-7" style={{ marginTop: GRID_PAD_PX, height: GRID_HEIGHT_PX }}>
            {columns.map((blocks: PlacedBlock[], i) => {
              const day = days[i]!;
              const isToday = i === todayCol;
              const dayIsPast = refTime !== null && day.getTime() < refTime && !isToday;
              return (
                <div key={localDayKey(day)} className="relative min-w-0 border-l border-border-subtle">
                  <ColumnGround tint={isToday ? 'today' : dayIsPast ? 'past' : null} />
                  {blocks.map((block) => (
                    <TimeBlock
                      key={block.event.id}
                      block={block}
                      dense
                      timezone={timezone}
                      isPast={dayIsPast || (isToday && nowMin !== null && block.endMin <= nowMin && block.endMin > block.startMin)}
                      isNow={isToday && nowMin !== null && block.startMin <= nowMin && nowMin < block.endMin}
                      rsvp={!isCoach ? userRsvpStatuses?.get(block.event.id) ?? null : null}
                      onClick={onEventClick}
                    />
                  ))}
                  {isToday && nowMin !== null && clock ? <NowLine nowMin={nowMin} clock={clock} timezone={timezone} /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {bookedMinutes > 0 ? (
        <p className="border-t border-border-subtle px-4 py-2 font-fw-sans text-caption tabular-nums text-text-tertiary">
          {formatDuration(bookedMinutes)} scheduled this week
        </p>
      ) : null}
    </section>
  );
}
