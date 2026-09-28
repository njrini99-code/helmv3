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
 * ========================================================================== */

import * as React from 'react';
import { differenceInCalendarDays, isSameDay, startOfDay } from 'date-fns';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, PressTarget } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import {
  eventCalendarDay,
  eventDaySpan,
  formatEventTime,
  getValidTimezone,
  zonedMinuteOfDay,
} from '@/lib/calendar/timezone';
import { RSVP_PILL, typeIcon, typeMeta, typeTone } from './eventPresentation';
import surfaces from './CalendarSurfaces.module.css';

/** One hour of the grid, in px. Every vertical position derives from it. */
export const DAY_GRID_HOUR_PX = 64;
const PX_PER_MIN = DAY_GRID_HOUR_PX / 60;
const DAY_MIN = 24 * 60;
/** A block is never shorter than a 44px tap target. */
const MIN_BLOCK_PX = 44;
const MIN_BLOCK_MIN = MIN_BLOCK_PX / PX_PER_MIN;
/** Air above 12 AM and below midnight so the edge labels are not clipped. */
const GRID_PAD_PX = 10;
/** The hours a team day is lit for; the rest sits on a faintly sunken ground. */
const DAYLIGHT = { from: 6 * 60, to: 21 * 60 };

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

/** `YYYY-MM-DD` of an instant on the team's calendar. */
function dayKeyInZone(date: Date, timezone: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getValidTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** `YYYY-MM-DD` of a team-local midnight Date (its fields ARE the team day). */
function localDayKey(day: Date): string {
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${m}-${d}`;
}

/** A minute clock that starts after mount and ticks on the minute boundary. */
function useMinuteClock(): Date | null {
  const [clock, setClock] = React.useState<Date | null>(null);
  React.useEffect(() => {
    let interval: number | undefined;
    setClock(new Date());
    const timeout = window.setTimeout(() => {
      setClock(new Date());
      interval = window.setInterval(() => setClock(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);
  return clock;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return 'Noon';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const MERIDIEM_RE = /\s?([AP]M)$/i;

/** "2:00 – 4:30 PM", "11:00 AM – 1:00 PM", or just the start. */
export function dayGridRangeLabel(event: CalendarEvent, timezone?: string | null): string {
  const startIso = event.start_time || event.start_date;
  if (!startIso) return '';
  const start = formatEventTime(startIso, timezone);
  const endIso = event.end_time || event.end_date;
  if (!endIso || endIso === startIso) return start;
  const end = formatEventTime(endIso, timezone);
  if (!end || end === start) return start;
  const sm = MERIDIEM_RE.exec(start)?.[1];
  const em = MERIDIEM_RE.exec(end)?.[1];
  return `${sm && sm === em ? start.replace(MERIDIEM_RE, '') : start} – ${end}`;
}

export interface PlacedBlock {
  event: CalendarEvent;
  /** Minutes past the team's midnight, clipped to this day. */
  startMin: number;
  endMin: number;
  /** The end the layout reserves: never less than a tap target. */
  layoutEnd: number;
  lane: number;
  lanes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Where a timed event sits on `day`, in team minutes, or null if it doesn't. */
function minutesOnDay(
  event: CalendarEvent,
  day: Date,
  timezone: string | null | undefined,
): Omit<PlacedBlock, 'lane' | 'lanes' | 'layoutEnd'> | null {
  const startIso = event.start_time || event.start_date;
  if (!startIso) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const startDay = eventCalendarDay(startIso, false, timezone);
  const continuesBefore = startDay.getTime() < day.getTime();
  if (!continuesBefore && !isSameDay(startDay, day)) return null;
  const startMin = continuesBefore ? 0 : zonedMinuteOfDay(start, timezone);

  let endMin = startMin;
  let continuesAfter = false;
  const endIso = event.end_time || event.end_date;
  if (endIso) {
    const end = new Date(endIso);
    if (!Number.isNaN(end.getTime()) && end.getTime() > start.getTime()) {
      const endDay = eventCalendarDay(endIso, false, timezone);
      if (endDay.getTime() > day.getTime()) {
        endMin = DAY_MIN;
        // Ending exactly at the next midnight is ending today.
        continuesAfter = !(differenceInCalendarDays(endDay, day) === 1 && zonedMinuteOfDay(end, timezone) === 0);
      } else if (isSameDay(endDay, day)) {
        endMin = zonedMinuteOfDay(end, timezone);
      } else {
        return null; // ended before this day began
      }
    }
  }
  return { event, startMin, endMin: Math.max(endMin, startMin), continuesBefore, continuesAfter };
}

/**
 * Side-by-side lanes for overlapping events. Events are taken in start order
 * (longer first on a tie); each joins the first lane that is free by its
 * start, and every event in a run of mutual overlaps shares that run's lane
 * count, so the run divides the column evenly. Layout uses the reserved
 * (tap-target) end, so two back-to-back short events never cover each other.
 */
export function layoutDayBlocks(
  items: ReadonlyArray<Omit<PlacedBlock, 'lane' | 'lanes' | 'layoutEnd'>>,
): PlacedBlock[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      b.endMin - b.startMin - (a.endMin - a.startMin) ||
      (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0),
  );
  const placed: PlacedBlock[] = [];
  let cluster: PlacedBlock[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    for (const block of cluster) block.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const item of sorted) {
    const layoutEnd = Math.min(DAY_MIN, Math.max(item.endMin, item.startMin + MIN_BLOCK_MIN));
    if (cluster.length > 0 && item.startMin >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(layoutEnd);
    } else {
      laneEnds[lane] = layoutEnd;
    }
    const block: PlacedBlock = { ...item, layoutEnd, lane, lanes: 1 };
    cluster.push(block);
    placed.push(block);
    clusterEnd = Math.max(clusterEnd, layoutEnd);
  }
  closeCluster();
  return placed;
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
    const timed: Array<Omit<PlacedBlock, 'lane' | 'lanes' | 'layoutEnd'>> = [];
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

  // ── Fit the hours to the viewport: the grid scrolls, the page doesn't ─────
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = React.useState<number | null>(null);
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const nav = parseFloat(getComputedStyle(el).getPropertyValue('--fw-mobile-nav-height')) || 64;
      const reserve = window.matchMedia('(min-width: 768px)').matches ? 24 : nav + 20;
      setFitHeight(Math.round(Math.min(960, Math.max(340, window.innerHeight - top - reserve))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Open where the day is happening: now (today) or the first event ───────
  const scrolledForRef = React.useRef<string | null>(null);
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolledForRef.current === focusKey) return;
    scrolledForRef.current = focusKey;
    const isToday = dayKeyInZone(new Date(), timezone) === focusKey;
    const firstStart = blocks.reduce((min, b) => Math.min(min, b.startMin), Number.POSITIVE_INFINITY);
    const anchorMin = isToday
      ? zonedMinuteOfDay(new Date(), timezone) - 90
      : Number.isFinite(firstStart)
        ? firstStart - 45
        : 7 * 60;
    el.scrollTop = Math.max(0, anchorMin * PX_PER_MIN);
  }, [focusKey, blocks, timezone]);

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

  const hours = Array.from({ length: 25 }, (_, h) => h);
  const gridHeight = DAY_MIN * PX_PER_MIN;

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
        <div className="relative flex" style={{ height: gridHeight + GRID_PAD_PX * 2 }}>
          {/* Hour gutter */}
          <div aria-hidden className="relative w-[52px] shrink-0 md:w-[60px]">
            {hours.map((h) => {
              // Step aside for the now pill so the two never overprint.
              const hidden = nowMin !== null && Math.abs(nowMin - h * 60) < 14;
              return (
                <span
                  key={h}
                  className={cn(
                    'absolute right-2 -translate-y-1/2 whitespace-nowrap font-fw-sans text-caption-2 font-medium tabular-nums text-text-tertiary',
                    hidden && 'invisible',
                  )}
                  style={{ top: GRID_PAD_PX + h * DAY_GRID_HOUR_PX }}
                >
                  {hourLabel(h)}
                </span>
              );
            })}
            {nowMin !== null ? (
              <span
                className="absolute right-1 z-[16] -translate-y-1/2 rounded-full bg-accent-fill px-1.5 py-px font-fw-sans text-caption-2 font-semibold tabular-nums text-text-on-accent-fill [box-shadow:0_1px_3px_oklch(0.25_0.05_150/0.35)]"
                style={{ top: GRID_PAD_PX + nowMin * PX_PER_MIN }}
              >
                {formatEventTime((clock as Date).toISOString(), timezone).replace(MERIDIEM_RE, '')}
              </span>
            ) : null}
          </div>

          {/* The day column */}
          <div className="relative min-w-0 flex-1 border-l border-border-subtle" style={{ marginTop: GRID_PAD_PX, height: gridHeight }}>
            {/* Night hours sit on a faintly sunken ground; the lit day stays surface. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0"
              style={{ height: DAYLIGHT.from * PX_PER_MIN, background: 'color-mix(in oklch, var(--fw-color-surface-sunken) 55%, transparent)' }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{ height: (DAY_MIN - DAYLIGHT.to) * PX_PER_MIN, background: 'color-mix(in oklch, var(--fw-color-surface-sunken) 55%, transparent)' }}
            />
            {/* Hour rules, with a fainter half-hour between them */}
            <div
              aria-hidden
              className={cn('pointer-events-none absolute inset-0', surfaces.hourRules)}
              style={{ ['--cal-hour' as string]: `${DAY_GRID_HOUR_PX}px` }}
            />

            {blocks.map((block) => (
              <DayBlock
                key={block.event.id}
                block={block}
                timezone={timezone}
                isPast={dayIsPast || (nowMin !== null && block.endMin <= nowMin && block.endMin > block.startMin)}
                isNow={current?.event.id === block.event.id}
                rsvp={!isCoach ? userRsvpStatuses?.get(block.event.id) ?? null : null}
                onClick={onEventClick}
              />
            ))}

            {nowMin !== null ? (
              <div
                role="separator"
                data-testid="day-grid-now-line"
                aria-label={`Now, ${formatEventTime((clock as Date).toISOString(), timezone)}`}
                className="pointer-events-none absolute inset-x-0 z-[15] h-0"
                style={{ top: nowMin * PX_PER_MIN }}
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] -translate-y-1/2 bg-accent-fill" />
                <span aria-hidden className="absolute -left-[6px] top-0 h-3 w-3 -translate-y-1/2 rounded-full bg-accent-fill ring-2 ring-surface" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

interface DayBlockProps {
  block: PlacedBlock;
  timezone?: string | null;
  isPast: boolean;
  isNow: boolean;
  rsvp: RSVPStatus | null;
  onClick?: (event: CalendarEvent) => void;
}

function DayBlock({ block, timezone, isPast, isNow, rsvp, onClick }: DayBlockProps) {
  const { event } = block;
  const tone = typeTone(event.event_type);
  const Icon = typeIcon(event.event_type);
  const { label: typeLabel } = typeMeta(event.event_type);
  const cancelled = event.status === 'cancelled';
  const receded = isPast || cancelled;
  const range = dayGridRangeLabel(event, timezone);
  const top = block.startMin * PX_PER_MIN;
  const height = Math.max(MIN_BLOCK_PX, (block.endMin - block.startMin) * PX_PER_MIN) - 3;
  const width = 100 / block.lanes;
  const compact = height < 56;
  const roomy = height >= 76;
  const rsvpMeta = rsvp ? RSVP_PILL[rsvp] : null;
  const ink = receded ? 'var(--fw-color-text-secondary)' : tone.ink;

  return (
    <PressTarget
      onClick={onClick ? () => onClick(event) : undefined}
      data-testid="day-grid-block"
      aria-label={`${event.title}, ${typeLabel}, ${range}${event.location ? `, ${event.location}` : ''}${cancelled ? ', cancelled' : ''}${isNow ? ', happening now' : ''}`}
      className={cn(
        'group absolute flex flex-col overflow-hidden rounded-fw-sm px-2.5 text-left focus-visible:z-20 focus-visible:ring-offset-0',
        compact ? 'justify-center py-1' : 'py-1.5',
        '[@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:-translate-y-px',
        isNow && 'z-[5]',
      )}
      style={{
        top: top + 1.5,
        height,
        left: `calc(${block.lane * width}% + 4px)`,
        width: `calc(${width}% - 8px)`,
        backgroundColor: receded ? 'var(--fw-color-surface-sunken)' : tone.bg,
        color: ink,
        boxShadow: receded
          ? 'inset 0 0 0 1px var(--fw-color-border-subtle)'
          : `inset 0 0 0 1px color-mix(in oklch, ${tone.ink} 24%, transparent), inset 0 1px 0 oklch(1 0 0 / 0.45), 0 1px 2px oklch(0.3 0.03 70 / 0.12), 0 6px 14px -8px color-mix(in oklch, ${tone.ink} 55%, transparent)`,
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span
          className={cn(
            'min-w-0 truncate font-fw-sans text-body-sm font-semibold leading-5',
            receded ? 'text-text-secondary' : undefined,
            cancelled && 'line-through decoration-2',
          )}
        >
          {event.title}
        </span>
        {compact ? (
          <span className="ml-auto shrink-0 font-fw-sans text-caption tabular-nums opacity-85">{range}</span>
        ) : null}
        {isNow ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-fill px-1.5 py-px font-fw-sans text-caption-2 font-semibold text-text-on-accent-fill">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-text-on-accent-fill motion-safe:animate-pulse" />
            Now
          </span>
        ) : null}
      </span>
      {!compact ? (
        <span className="mt-px truncate font-fw-sans text-caption tabular-nums leading-4 opacity-90">
          {range}
          {!roomy && event.location ? ` · ${event.location}` : ''}
        </span>
      ) : null}
      {roomy && event.location ? (
        <span className="mt-1 flex min-w-0 items-center gap-1 font-fw-sans text-caption leading-4 opacity-85">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{event.location}</span>
        </span>
      ) : null}
      {roomy && (rsvpMeta || cancelled) ? (
        <span className="mt-auto pt-1 font-fw-sans text-caption font-semibold">
          {cancelled ? 'Cancelled' : rsvpMeta?.label}
        </span>
      ) : null}
    </PressTarget>
  );
}
