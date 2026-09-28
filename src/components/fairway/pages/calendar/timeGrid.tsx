'use client';

/**
 * ============================================================================
 * Fairway · Calendar · timeGrid — the parts the Day and Week grids share
 * ----------------------------------------------------------------------------
 * The clock, the geometry and the pieces a time grid is drawn with: the hour
 * gutter, the column ground (quiet hour rules; night hours and weekend days a
 * step sunken), the now-line, and the event block. `FairwayDayTimeGrid` draws
 * one column with them, `FairwayWeekTimeGrid` seven.
 *
 * Every position and time label comes from the TEAM clock
 * (`zonedMinuteOfDay`, `formatEventTime` with the team zone), never the
 * device's. Anything that depends on the current minute waits for the mount
 * clock, so the server render and the first client render agree (React #418).
 * ========================================================================== */

import * as React from 'react';
import { differenceInCalendarDays, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { PressTarget } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { eventCalendarDay, formatEventTime, getValidTimezone, zonedMinuteOfDay } from '@/lib/calendar/timezone';
import { EVENT_BAR, EVENT_SURFACE, RSVP_PILL, eventToneVars, typeIcon, typeMeta } from './eventPresentation';
import surfaces from './CalendarSurfaces.module.css';

/** One hour of the grid, in px. Every vertical position derives from it. */
export const DAY_GRID_HOUR_PX = 64;
export const PX_PER_MIN = DAY_GRID_HOUR_PX / 60;
export const DAY_MIN = 24 * 60;
/** A block is never shorter than a 44px tap target. */
export const MIN_BLOCK_PX = 44;
/** The air between two blocks that meet, stacked or side by side. */
export const BLOCK_GAP_PX = 2;
/** The layout reserves a tap target plus the gap, so two short events never touch. */
const MIN_BLOCK_MIN = (MIN_BLOCK_PX + BLOCK_GAP_PX) / PX_PER_MIN;
/** Air above 12 AM so the top hour label is not clipped. */
export const GRID_PAD_PX = 10;
/** Room under midnight, so the last hour scrolls clear of the scroller's edge. */
export const GRID_PAD_BOTTOM_PX = 32;
/** The hours a team day is lit for; the rest sits on a faintly sunken ground. */
const DAYLIGHT = { from: 6 * 60, to: 21 * 60 };
export const GRID_HEIGHT_PX = DAY_MIN * PX_PER_MIN;
/** The scroller's content: the day, plus the air above and below it. */
export const GRID_CONTENT_PX = GRID_HEIGHT_PX + GRID_PAD_PX + GRID_PAD_BOTTOM_PX;
/** How much of the day shows above the first thing the grid opens on. */
export const ANCHOR_LEAD_MIN = 60;
const EMPTY_DAY_ANCHOR_MIN = 7 * 60;

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
 * The minute a time grid opens on, with an hour of lead above it:
 *   · today, with something still to come: now (or the start of what is on);
 *   · today, all done: the first event, so the day that happened is on
 *     screen rather than an empty evening;
 *   · any other day: its first event; an empty day: 7 AM.
 */
export function scrollAnchorMinute(
  spans: ReadonlyArray<{ startMin: number; endMin: number }>,
  nowMin: number | null,
): number {
  if (nowMin !== null && (spans.length === 0 || spans.some((s) => s.endMin > nowMin))) {
    const onNow = spans.reduce(
      (min, s) => (s.startMin <= nowMin && nowMin < s.endMin ? Math.min(min, s.startMin) : min),
      nowMin,
    );
    return Math.max(0, onNow - ANCHOR_LEAD_MIN);
  }
  const first = spans.reduce((min, s) => Math.min(min, s.startMin), Number.POSITIVE_INFINITY);
  return Number.isFinite(first) ? Math.max(0, first - ANCHOR_LEAD_MIN) : EMPTY_DAY_ANCHOR_MIN;
}

/**
 * What the fitted scroller leaves free under itself. From md up: the page's
 * breathing room plus, for a coach, the fixed Ask CoachHelm launcher
 * (`bottom-6`, `h-14`: the bottom 80px of the window), so it never sits on the
 * hours. On a phone: the tab bar plus, for a coach, the floating new-event
 * button above it (`nav + 1rem`, `h-14`).
 */
function bottomReserve(el: HTMLElement, clearFloatingAction: boolean): number {
  if (window.matchMedia('(min-width: 768px)').matches) return clearFloatingAction ? 96 : 24;
  const nav = parseFloat(getComputedStyle(el).getPropertyValue('--fw-mobile-nav-height')) || 64;
  return nav + (clearFloatingAction ? 84 : 20);
}

/**
 * The grid's own scroller, fitted to the viewport (the hours scroll, the page
 * doesn't), opened once per `anchorKey` at the minute `anchorMin()` returns.
 */
export function useFittedTimeScroller(anchorKey: string, anchorMin: () => number, clearFloatingAction = false) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = React.useState<number | null>(null);
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const reserve = bottomReserve(el, clearFloatingAction);
      setFitHeight(Math.round(Math.min(960, Math.max(340, window.innerHeight - top - reserve))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [clearFloatingAction]);

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
              'absolute right-2 -translate-y-1/2 whitespace-nowrap font-fw-sans text-caption tabular-nums text-text-tertiary',
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
          className="absolute right-1 z-[16] -translate-y-1/2 rounded-full bg-accent-fill px-1.5 py-px font-fw-sans text-caption font-semibold tabular-nums text-text-on-accent-fill ring-2 ring-surface"
          style={{ top: GRID_PAD_PX + nowMin * PX_PER_MIN }}
        >
          {formatEventTime(clock.toISOString(), timezone).replace(MERIDIEM_RE, '')}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A column's ground: quiet hour rules with a whisper on the half hour, the
 * night hours a half step sunken, and a weekend day sunken whole (no night
 * shade on top of it, so the two never stack into a muddy band).
 */
export function ColumnGround({ weekend = false }: { weekend?: boolean }) {
  const night = 'color-mix(in oklch, var(--fw-color-surface-sunken) 45%, transparent)';
  return (
    <>
      {weekend ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-surface-sunken" />
      ) : (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{ height: DAYLIGHT.from * PX_PER_MIN, background: night }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{ height: (DAY_MIN - DAYLIGHT.to) * PX_PER_MIN, background: night }}
          />
        </>
      )}
      <div
        aria-hidden
        className={cn('pointer-events-none absolute inset-0', surfaces.hourRules)}
        style={{ ['--cal-hour' as string]: `${DAY_GRID_HOUR_PX}px` }}
      />
    </>
  );
}

/** The now-line across a column: today's marker, in the one green. */
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
  /** On now: the now-line crosses it and screen readers hear "happening now". */
  isNow: boolean;
  rsvp: RSVPStatus | null;
  onClick?: (event: CalendarEvent) => void;
  /** Narrow week columns: tighter padding, no icon, the time only. */
  dense?: boolean;
}

/** Below this a block has room for one line: title and time side by side. */
const ONE_LINE_BELOW_PX = 60;
/** From this height a player's block also carries their reply. */
const RSVP_LINE_FROM_PX = 96;

/**
 * One timed event: a solid block in its type's colour with the type's ink as a
 * 3px bar down the left edge, as tall as it lasts. A past event keeps its
 * colour (the now-line and the header say what is over); a cancelled one
 * drops to the sunken ground, struck through. The label is sticky, so a tall
 * block scrolled half out of view still names itself at the top of the grid.
 * `overflow-clip`, not `overflow-hidden`: hidden would make the block its own
 * scroll container, and the label would never stick.
 */
export function TimeBlock({ block, timezone, isNow, rsvp, onClick, dense = false }: TimeBlockProps) {
  const { event } = block;
  const Icon = typeIcon(event.event_type);
  const { label: typeLabel } = typeMeta(event.event_type);
  const cancelled = event.status === 'cancelled';
  const range = dayGridRangeLabel(event, timezone);
  const height = Math.max(MIN_BLOCK_PX, (block.endMin - block.startMin) * PX_PER_MIN - BLOCK_GAP_PX);
  const width = 100 / block.lanes;
  // Air at the column's edges; half the gap on each side where lanes meet.
  const edge = dense ? 2 : 4;
  const left = block.lane === 0 ? edge : BLOCK_GAP_PX / 2;
  const right = block.lane === block.lanes - 1 ? edge : BLOCK_GAP_PX / 2;
  const oneLine = !dense && height < ONE_LINE_BELOW_PX;
  const rsvpLabel = rsvp ? RSVP_PILL[rsvp].label : null;
  const when = cancelled ? `Cancelled · ${range}` : range;
  const meta = !dense && event.location ? `${when} · ${event.location}` : when;
  const title = cn(
    'min-w-0 truncate font-fw-sans font-semibold',
    dense ? 'text-body-sm leading-4' : 'text-sm leading-5',
    cancelled ? 'text-text-secondary line-through' : 'text-text-primary',
  );

  return (
    <PressTarget
      onClick={onClick ? () => onClick(event) : undefined}
      data-testid="day-grid-block"
      aria-label={`${event.title}, ${typeLabel}, ${range}${event.location ? `, ${event.location}` : ''}${cancelled ? ', cancelled' : ''}${isNow ? ', happening now' : ''}`}
      className={cn(
        'absolute block overflow-clip rounded-fw-sm text-left',
        EVENT_SURFACE,
        'hover:z-10 focus-visible:z-20 focus-visible:ring-offset-0',
        isNow && 'z-[5]',
      )}
      style={{
        ...eventToneVars(event.event_type, { cancelled }),
        top: block.startMin * PX_PER_MIN + BLOCK_GAP_PX / 2,
        height,
        left: `calc(${block.lane * width}% + ${left}px)`,
        width: `calc(${width}% - ${left + right}px)`,
      }}
    >
      <span aria-hidden className={EVENT_BAR} />
      {oneLine ? (
        <span className="flex h-full min-w-0 items-center gap-2 pl-3 pr-2.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--ev-ink)]" aria-hidden />
          <span className={title}>{event.title}</span>
          <span className="ml-auto shrink-0 font-fw-sans text-body-sm tabular-nums text-text-secondary">{when}</span>
        </span>
      ) : (
        <span data-slot="block-label" className={cn('sticky top-0 block', dense ? 'py-1 pl-2 pr-1.5' : 'py-2 pl-3 pr-2.5')}>
          <span className="flex min-w-0 items-center gap-1.5">
            {dense ? null : <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--ev-ink)]" aria-hidden />}
            <span className={title}>{event.title}</span>
          </span>
          <span
            className={cn(
              'block truncate font-fw-sans tabular-nums text-text-secondary',
              dense ? 'text-caption leading-4' : 'mt-0.5 text-body-sm',
            )}
          >
            {dense ? when : meta}
          </span>
          {!dense && rsvpLabel && height >= RSVP_LINE_FROM_PX ? (
            <span className="mt-1 block font-fw-sans text-caption font-semibold text-text-primary">{rsvpLabel}</span>
          ) : null}
        </span>
      )}
    </PressTarget>
  );
}
