'use client';

/**
 * ============================================================================
 * Fairway · Calendar · timeGrid — the parts the Day and Week grids share
 * ----------------------------------------------------------------------------
 * The clock, the geometry and the pieces a time grid is drawn with: the hour
 * gutter, the column ground (night shade + hour rules), the now-line, and the
 * event block. `FairwayDayTimeGrid` draws one column with them,
 * `FairwayWeekTimeGrid` seven.
 *
 * Every position and time label comes from the TEAM clock
 * (`zonedMinuteOfDay`, `formatEventTime` with the team zone), never the
 * device's. Anything that depends on the current minute waits for the mount
 * clock, so the server render and the first client render agree (React #418).
 * ========================================================================== */

import * as React from 'react';
import { differenceInCalendarDays, isSameDay } from 'date-fns';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PressTarget } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { eventCalendarDay, formatEventTime, getValidTimezone, zonedMinuteOfDay } from '@/lib/calendar/timezone';
import { RSVP_PILL, typeIcon, typeMeta, typeTone } from './eventPresentation';
import surfaces from './CalendarSurfaces.module.css';

/** One hour of the grid, in px. Every vertical position derives from it. */
export const DAY_GRID_HOUR_PX = 64;
export const PX_PER_MIN = DAY_GRID_HOUR_PX / 60;
export const DAY_MIN = 24 * 60;
/** A block is never shorter than a 44px tap target. */
export const MIN_BLOCK_PX = 44;
const MIN_BLOCK_MIN = MIN_BLOCK_PX / PX_PER_MIN;
/** Air above 12 AM and below midnight so the edge labels are not clipped. */
export const GRID_PAD_PX = 10;
/** The hours a team day is lit for; the rest sits on a faintly sunken ground. */
const DAYLIGHT = { from: 6 * 60, to: 21 * 60 };
export const GRID_HEIGHT_PX = DAY_MIN * PX_PER_MIN;

export const MERIDIEM_RE = /\s?([AP]M)$/i;

/** `YYYY-MM-DD` of an instant on the team's calendar. */
export function dayKeyInZone(date: Date, timezone: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getValidTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** `YYYY-MM-DD` of a team-local midnight Date (its fields ARE the team day). */
export function localDayKey(day: Date): string {
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${m}-${d}`;
}

/** A minute clock that starts after mount and ticks on the minute boundary. */
export function useMinuteClock(): Date | null {
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

export const useIsoLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

export function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return 'Noon';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

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

export type DayMinutes = Omit<PlacedBlock, 'lane' | 'lanes' | 'layoutEnd'>;

/** Where a timed event sits on `day`, in team minutes, or null if it doesn't. */
export function minutesOnDay(
  event: CalendarEvent,
  day: Date,
  timezone: string | null | undefined,
): DayMinutes | null {
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
export function layoutDayBlocks(items: ReadonlyArray<DayMinutes>): PlacedBlock[] {
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

/**
 * The grid's own scroller, fitted to the viewport (the hours scroll, the page
 * doesn't), opened once per `anchorKey` at the minute `anchorMin()` returns.
 */
export function useFittedTimeScroller(anchorKey: string, anchorMin: () => number) {
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

  const anchorRef = React.useRef(anchorMin);
  anchorRef.current = anchorMin;
  const scrolledForRef = React.useRef<string | null>(null);
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolledForRef.current === anchorKey) return;
    scrolledForRef.current = anchorKey;
    el.scrollTop = Math.max(0, anchorRef.current() * PX_PER_MIN);
  }, [anchorKey]);

  return { scrollRef, fitHeight };
}

/** The hour labels down the left edge, with the now pill when it's today. */
export function HourGutter({
  nowMin,
  clock,
  timezone,
  className,
}: {
  nowMin: number | null;
  clock: Date | null;
  timezone?: string | null;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn('relative w-[52px] shrink-0 md:w-[60px]', className)}>
      {Array.from({ length: 25 }, (_, h) => {
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
      {nowMin !== null && clock ? (
        <span
          className="absolute right-1 z-[16] -translate-y-1/2 rounded-full bg-accent-fill px-1.5 py-px font-fw-sans text-caption-2 font-semibold tabular-nums text-text-on-accent-fill [box-shadow:0_1px_3px_oklch(0.25_0.05_150/0.35)]"
          style={{ top: GRID_PAD_PX + nowMin * PX_PER_MIN }}
        >
          {formatEventTime(clock.toISOString(), timezone).replace(MERIDIEM_RE, '')}
        </span>
      ) : null}
    </div>
  );
}

/** A column's ground: night hours faintly sunken, firm hour rules, half-hour whispers. */
export function ColumnGround({ tint }: { tint?: 'today' | 'past' | null }) {
  const shade = 'color-mix(in oklch, var(--fw-color-surface-sunken) 55%, transparent)';
  return (
    <>
      {tint === 'today' ? (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'color-mix(in oklch, var(--fw-color-accent-50) 70%, transparent)' }} />
      ) : tint === 'past' ? (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'color-mix(in oklch, var(--fw-color-surface-sunken) 35%, transparent)' }} />
      ) : null}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ height: DAYLIGHT.from * PX_PER_MIN, background: shade }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: (DAY_MIN - DAYLIGHT.to) * PX_PER_MIN, background: shade }} />
      <div
        aria-hidden
        className={cn('pointer-events-none absolute inset-0', surfaces.hourRules)}
        style={{ ['--cal-hour' as string]: `${DAY_GRID_HOUR_PX}px` }}
      />
    </>
  );
}

/** The green now-line across a column. */
export function NowLine({ nowMin, clock, timezone }: { nowMin: number; clock: Date; timezone?: string | null }) {
  return (
    <div
      role="separator"
      data-testid="day-grid-now-line"
      aria-label={`Now, ${formatEventTime(clock.toISOString(), timezone)}`}
      className="pointer-events-none absolute inset-x-0 z-[15] h-0"
      style={{ top: nowMin * PX_PER_MIN }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] -translate-y-1/2 bg-accent-fill" />
      <span aria-hidden className="absolute -left-[6px] top-0 h-3 w-3 -translate-y-1/2 rounded-full bg-accent-fill ring-2 ring-surface" />
    </div>
  );
}

export interface TimeBlockProps {
  block: PlacedBlock;
  timezone?: string | null;
  isPast: boolean;
  isNow: boolean;
  rsvp: RSVPStatus | null;
  onClick?: (event: CalendarEvent) => void;
  /** Narrow week columns: tighter padding, no location line. */
  dense?: boolean;
}

/** One timed event: tinted by type, as tall as it lasts, receded once it's over. */
export function TimeBlock({ block, timezone, isPast, isNow, rsvp, onClick, dense = false }: TimeBlockProps) {
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
  const roomy = !dense && height >= 76;
  const rsvpMeta = rsvp ? RSVP_PILL[rsvp] : null;
  const gap = dense ? 2 : 4;

  return (
    <PressTarget
      onClick={onClick ? () => onClick(event) : undefined}
      data-testid="day-grid-block"
      aria-label={`${event.title}, ${typeLabel}, ${range}${event.location ? `, ${event.location}` : ''}${cancelled ? ', cancelled' : ''}${isNow ? ', happening now' : ''}`}
      className={cn(
        'group absolute flex flex-col overflow-hidden rounded-fw-sm text-left focus-visible:z-20 focus-visible:ring-offset-0',
        dense ? 'px-1.5' : 'px-2.5',
        compact ? 'justify-center py-1' : 'py-1.5',
        '[@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:-translate-y-px',
        isNow && 'z-[5]',
      )}
      style={{
        top: top + 1.5,
        height,
        left: `calc(${block.lane * width}% + ${gap}px)`,
        width: `calc(${width}% - ${gap * 2}px)`,
        backgroundColor: receded ? 'var(--fw-color-surface-sunken)' : tone.bg,
        color: receded ? 'var(--fw-color-text-secondary)' : tone.ink,
        boxShadow: receded
          ? 'inset 0 0 0 1px var(--fw-color-border-subtle)'
          : `inset 0 0 0 1px color-mix(in oklch, ${tone.ink} 24%, transparent), inset 0 1px 0 oklch(1 0 0 / 0.45), 0 1px 2px oklch(0.3 0.03 70 / 0.12), 0 6px 14px -8px color-mix(in oklch, ${tone.ink} 55%, transparent)`,
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {dense ? null : <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        <span
          className={cn(
            'min-w-0 truncate font-fw-sans font-semibold',
            dense ? 'text-caption leading-4' : 'text-body-sm leading-5',
            receded ? 'text-text-secondary' : undefined,
            cancelled && 'line-through decoration-2',
          )}
        >
          {event.title}
        </span>
        {compact && !dense ? (
          <span className="ml-auto shrink-0 font-fw-sans text-caption tabular-nums opacity-85">{range}</span>
        ) : null}
        {isNow && !dense ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-fill px-1.5 py-px font-fw-sans text-caption-2 font-semibold text-text-on-accent-fill">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-text-on-accent-fill motion-safe:animate-pulse" />
            Now
          </span>
        ) : null}
      </span>
      {!compact || dense ? (
        <span className={cn('mt-px truncate font-fw-sans tabular-nums leading-4 opacity-90', dense ? 'text-caption-2' : 'text-caption')}>
          {range}
          {!roomy && !dense && event.location ? ` · ${event.location}` : ''}
        </span>
      ) : null}
      {roomy && event.location ? (
        <span className="mt-1 flex min-w-0 items-center gap-1 font-fw-sans text-caption leading-4 opacity-85">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{event.location}</span>
        </span>
      ) : null}
      {roomy && (rsvpMeta || cancelled) ? (
        <span className="mt-auto pt-1 font-fw-sans text-caption font-semibold">{cancelled ? 'Cancelled' : rsvpMeta?.label}</span>
      ) : null}
    </PressTarget>
  );
}
