'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayMonthGrid — the Month view
 * ----------------------------------------------------------------------------
 * A month you can read at a glance. A sunken header says what the month
 * holds (a big count, and a legend of the types on the books with their
 * counts) above the weekday row, which a strong hairline closes. Each week is
 * one row: an all-day or multi-day event is ONE bar across the days it covers
 * (the two-day Fall Invitational spans Friday and Saturday), and timed events
 * are chips with their start time, painted exactly like the Day and Week
 * blocks (the type's fill, its ink as a bar down the left edge). Every row
 * shares one height, fitted to the window so the whole month (and this
 * week's row) is on screen; a day holding more than fits says "+N more" and
 * opens that day. Weekends and days outside the month sit a step sunken;
 * today is marked by its date in the green disc (green is spent on nothing
 * else here); days outside the month are muted, their events are not.
 *
 * Presentation only: it opens the same detail drawer as every other view.
 * Day membership is `eventDaySpan` (the team clock), as in Day and Week, so
 * an all-day event stored at UTC midnight never slides a cell early.
 *
 * AVAILABILITY OVERLAY: when the coach selects team members, the parent passes
 * `overlays` (each selected player's busy periods, color-coded). The grid then
 * renders those chips INSTEAD of team events and the legend names the people.
 * Overlay colors are the legacy PLAYER_COLORS (hex, so inline style).
 *
 * Phones (below sm) get the compact month: 64px rows, one target per day and
 * up to three type dots. The calendar shows FairwayMonthOverview on a phone,
 * so this mode serves the availability overlay there.
 * ========================================================================== */

import * as React from 'react';
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PressTarget } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { eventDaySpan, formatEventTimeCompact, zonedMidnight } from '@/lib/calendar/timezone';
import { CANCELLED_TONE_VARS, EVENT_BAR, EVENT_SURFACE, eventToneVars, typeIcon, typeMeta, typeToneClasses } from './eventPresentation';
import { tintFor } from './FairwayCalendarMemberRail';
import { dayGridRangeLabel, localDayKey, useIsoLayoutEffect } from './timeGrid';

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
  /** The day the calendar is focused on, if any: a soft green date disc. */
  selectedDate?: Date;
  /**
   * Team's canonical IANA timezone — chip times render anchored to this zone
   * so they agree with the Agenda row and detail drawer (audit W1: cal-tz).
   */
  timezone?: string | null;
  /** Coach availability overlays — when present, replace team events. */
  overlays?: ScheduleOverlay[];
  /** Click an event chip → open the Fairway detail drawer. */
  onEventClick?: (event: CalendarEvent) => void;
  /** Click a day (its date strip / phone cell / "+N more") → open that day. */
  onSelectDate?: (date: Date) => void;
  className?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/* ── Row geometry ─────────────────────────────────────────────────────────
   Rows share one height (a busy week must not stretch its own row). The
   height is fitted to the window between these bounds; the lanes that fit
   follow from it: a 32px date strip, then 22px chips on a 24px pitch. */
const ROW_MIN_PX = 96;
const ROW_MAX_PX = 164;
const ROW_DEFAULT_PX = 124;
const DATE_STRIP_PX = 32;
const LANE_PITCH_PX = 24;
const LANE_GAP_PX = 2;
const ROW_BOTTOM_PAD_PX = 4;

/** How many chip lanes fit in a row of `rowHeight` px (at least one). */
export function monthLaneCapacity(rowHeight: number): number {
  const room = rowHeight - DATE_STRIP_PX - ROW_BOTTOM_PAD_PX + LANE_GAP_PX;
  return Math.max(1, Math.floor(room / LANE_PITCH_PX));
}

/* Grid placement as literal classes (not inline style), so a team event's
   chip carries no style attribute and Tailwind sees every class. */
const COL_START = ['col-start-1', 'col-start-2', 'col-start-3', 'col-start-4', 'col-start-5', 'col-start-6', 'col-start-7'] as const;
const COL_END = ['col-end-2', 'col-end-3', 'col-end-4', 'col-end-5', 'col-end-6', 'col-end-7', 'col-end-8'] as const;
const ROW_START = ['row-start-1', 'row-start-2', 'row-start-3', 'row-start-4', 'row-start-5', 'row-start-6', 'row-start-7', 'row-start-8'] as const;

/** Phone density dots: at most three, one per distinct type. */
const MAX_DOTS = 3;

/** One thing on the month: a team event, or a selected player's busy block. */
export type MonthItem =
  | { kind: 'event'; id: string; at: number; first: Date; last: Date; bar: boolean; event: CalendarEvent }
  | { kind: 'overlay'; id: string; at: number; first: Date; last: Date; bar: false; overlay: ScheduleOverlay };

export interface MonthSegment {
  item: MonthItem;
  startCol: number;
  endCol: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  lane: number;
}

/**
 * One week row's layout: every item that touches the week, clamped to its
 * columns and stacked into the fewest lanes. Bars go first (earliest start,
 * then longest), so a multi-day event keeps one lane across its days; timed
 * chips then fill each day's free lanes in start-time order.
 */
export function layoutMonthWeek(items: readonly MonthItem[], weekStart: Date): MonthSegment[] {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const segments: Array<Omit<MonthSegment, 'lane'>> = [];
  for (const item of items) {
    if (item.last.getTime() < weekStart.getTime() || item.first.getTime() > weekEnd.getTime()) continue;
    segments.push({
      item,
      startCol: Math.max(0, differenceInCalendarDays(item.first, weekStart)),
      endCol: Math.min(6, differenceInCalendarDays(item.last, weekStart)),
      continuesBefore: item.first.getTime() < weekStart.getTime(),
      continuesAfter: item.last.getTime() > weekEnd.getTime(),
    });
  }
  segments.sort(
    (a, b) =>
      Number(b.item.bar) - Number(a.item.bar) ||
      a.startCol - b.startCol ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      a.item.at - b.item.at ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );
  const taken: boolean[][] = [];
  return segments.map((segment) => {
    let lane = 0;
    for (;;) {
      const row = taken[lane] ?? (taken[lane] = [false, false, false, false, false, false, false]);
      let free = true;
      for (let c = segment.startCol; c <= segment.endCol; c++) {
        if (row[c]) {
          free = false;
          break;
        }
      }
      if (free) {
        for (let c = segment.startCol; c <= segment.endCol; c++) row[c] = true;
        return { ...segment, lane };
      }
      lane++;
    }
  });
}

/** Fit every row to the window once the grid is on screen (null until then). */
function useFittedRowHeight(weekCount: number) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = React.useState<number | null>(null);
  useIsoLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || weekCount === 0) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const room = window.innerHeight - top - 24;
      setRowHeight(Math.max(ROW_MIN_PX, Math.min(ROW_MAX_PX, Math.floor(room / weekCount))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [weekCount]);
  return { bodyRef, rowHeight: rowHeight ?? ROW_DEFAULT_PX };
}

/**
 * Team events as month items, each with the local days it runs. An event
 * occupies EVERY day it runs, not just its start day (the Transylvania
 * Invite, Sep 3–6, once vanished after its first day); `end_time` is the
 * INCLUSIVE last day of an all-day event (#1493). `eventDaySpan` takes the
 * explicit team zone, never the process's own: an SSR pass (UTC) and a
 * client render (ET) must agree, and an all-day event stored at UTC midnight
 * must not drop a day early west of UTC (audit W1/cal-tz).
 */
export function eventMonthItems(events: readonly CalendarEvent[], timezone?: string | null): MonthItem[] {
  const out: MonthItem[] = [];
  for (const e of events) {
    const start = e.start_time || e.start_date;
    if (!start) continue;
    const span = eventDaySpan(e, timezone);
    if (!span) continue;
    out.push({
      kind: 'event',
      id: e.id,
      at: new Date(start).getTime(),
      first: span.first,
      last: span.last,
      bar: Boolean(e.all_day) || span.last.getTime() > span.first.getTime(),
      event: e,
    });
  }
  return out;
}

/** A selected player's busy blocks, each on its (team-zone) start day. */
function overlayMonthItems(overlays: readonly ScheduleOverlay[], timezone?: string | null): MonthItem[] {
  const out: MonthItem[] = [];
  for (const o of overlays) {
    if (!o.start) continue;
    const day = zonedMidnight(o.start, timezone);
    out.push({ kind: 'overlay', id: `overlay:${o.id}`, at: new Date(o.start).getTime(), first: day, last: day, bar: false, overlay: o });
  }
  return out;
}

export interface MonthLegendEntry {
  key: string;
  label: string;
  count: number;
  swatchClass?: string;
  swatchStyle?: React.CSSProperties;
}

export interface MonthSummary {
  count: number;
  legend: MonthLegendEntry[];
}

/** How much is in the focused month (days outside it don't count), by type or person. */
export function summarizeMonth(items: readonly MonthItem[], focusDate: Date): MonthSummary {
  const monthStart = startOfMonth(focusDate).getTime();
  const monthEnd = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 1).getTime() - 1;
  const legend = new Map<string, MonthLegendEntry>();
  let count = 0;
  for (const item of items) {
    if (item.last.getTime() < monthStart || item.first.getTime() > monthEnd) continue;
    count++;
    const key = item.kind === 'overlay' ? item.overlay.playerName : typeMeta(item.event.event_type).label;
    const entry = legend.get(key);
    if (entry) {
      entry.count++;
    } else if (item.kind === 'overlay') {
      legend.set(key, { key, label: key, count: 1, swatchStyle: { backgroundColor: item.overlay.color.bg } });
    } else {
      legend.set(key, { key, label: key, count: 1, swatchClass: typeToneClasses(item.event.event_type).dot });
    }
  }
  return {
    count,
    legend: Array.from(legend.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

/**
 * The month header's top line: a big count, then the legend (a type's ink
 * dot, its name, how many). Plain text, no pills: the header's sunken ground
 * and the type colours carry it.
 */
export function MonthSummaryHeader({
  summary,
  monthName,
  overlayMode = false,
  className,
}: {
  summary: MonthSummary;
  monthName: string;
  overlayMode?: boolean;
  className?: string;
}) {
  const noun = overlayMode
    ? summary.count === 1 ? 'busy block' : 'busy blocks'
    : summary.count === 1 ? 'event' : 'events';
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5', className)}>
      <p className="flex min-w-0 items-baseline gap-2 font-fw-sans" data-testid="month-grid-count">
        <span className="text-h2 tabular-nums leading-none text-text-primary">{summary.count}</span>{' '}
        <span className="text-body-sm text-text-tertiary">
          {noun} in {monthName}
        </span>
      </p>
      {summary.legend.length > 0 ? (
        <ul
          aria-label={overlayMode ? 'Schedules shown' : `Event types in ${monthName}`}
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5"
        >
          {summary.legend.map((entry) => (
            <li key={entry.key} className="inline-flex items-center gap-1.5 font-fw-sans text-caption font-semibold text-text-primary">
              <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', entry.swatchClass)} style={entry.swatchStyle} />
              {entry.label}
              <span className="tabular-nums text-text-tertiary">{entry.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-fw-sans text-body-sm text-text-secondary">Nothing on the books yet</p>
      )}
    </div>
  );
}

function itemTitle(item: MonthItem): string {
  if (item.kind === 'overlay') return `${item.overlay.playerName} · ${item.overlay.title}`;
  const e = item.event;
  return [e.owner_label ? `${e.owner_label} — ` : '', e.title, e.status === 'cancelled' ? ' (cancelled)' : ''].join('');
}

const longDay = (d: Date) => format(d, 'EEEE, MMMM d');

export function FairwayMonthGrid({
  events,
  focusDate,
  nowRef,
  selectedDate,
  timezone,
  overlays,
  onEventClick,
  onSelectDate,
  className,
}: FairwayMonthGridProps) {
  const overlayMode = (overlays?.length ?? 0) > 0;

  // The weeks on screen: Sunday through Saturday, covering the whole month.
  const weeks = React.useMemo(() => {
    const all = eachDayOfInterval({
      start: startOfWeek(startOfMonth(focusDate), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(focusDate), { weekStartsOn: 0 }),
    });
    const rows: Date[][] = [];
    for (let i = 0; i < all.length; i += 7) rows.push(all.slice(i, i + 7));
    return rows;
  }, [focusDate]);

  const items = React.useMemo<MonthItem[]>(
    () => (overlayMode ? overlayMonthItems(overlays ?? [], timezone) : eventMonthItems(events, timezone)),
    [events, overlays, overlayMode, timezone],
  );

  const layouts = React.useMemo(
    () => weeks.map((week) => layoutMonthWeek(items, week[0]!)),
    [weeks, items],
  );

  const summary = React.useMemo(() => summarizeMonth(items, focusDate), [items, focusDate]);

  const { bodyRef, rowHeight } = useFittedRowHeight(weeks.length);
  const capacity = monthLaneCapacity(rowHeight);
  const monthName = format(focusDate, 'MMMM');

  return (
    <section
      aria-label={format(focusDate, 'MMMM yyyy')}
      data-testid="month-grid"
      className={cn(
        'overflow-hidden rounded-card border border-border-subtle bg-surface',
        '[box-shadow:inset_0_1px_0_oklch(1_0_0/0.55),var(--fw-shadow-soft)]',
        className,
      )}
    >
      {/* ── What the month holds: a sunken header, a strong rule under it ── */}
      <div className="bg-surface-sunken">
        <MonthSummaryHeader summary={summary} monthName={monthName} overlayMode={overlayMode} />
        <div className="grid grid-cols-7 border-y border-b-border-strong border-t-border-subtle">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 py-2 text-center font-fw-sans text-caption font-semibold text-text-secondary sm:px-2.5 sm:text-left">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.charAt(0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── The weeks ──────────────────────────────────────────────────── */}
      <div ref={bodyRef} style={{ '--fw-month-row-h': `${rowHeight}px` } as React.CSSProperties}>
        {weeks.map((week, w) => {
          const segments = layouts[w] ?? [];
          const laneCount = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);
          // A row that can't show everything gives its last lane to "+N more".
          const shown = laneCount > capacity ? capacity - 1 : capacity;
          const perDay = week.map((_, c) => segments.filter((s) => s.startCol <= c && c <= s.endCol));
          return (
            <div
              key={localDayKey(week[0]!)}
              className="relative grid h-16 grid-cols-7 border-t border-border-subtle first:border-t-0 sm:h-[var(--fw-month-row-h)]"
            >
              {week.map((day, c) => (
                <DayCell
                  key={localDayKey(day)}
                  day={day}
                  focusDate={focusDate}
                  nowRef={nowRef}
                  selectedDate={selectedDate}
                  segments={perDay[c] ?? []}
                  overlayMode={overlayMode}
                  onSelectDate={onSelectDate}
                />
              ))}

              {/* Bars and chips, laid in lanes over the week (sm and up). */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-1 hidden auto-rows-[22px] grid-cols-7 content-start gap-y-0.5 overflow-hidden sm:grid"
                style={{ top: DATE_STRIP_PX }}
              >
                {segments
                  .filter((s) => s.lane < shown)
                  .map((segment) => (
                    <MonthChip
                      key={`${segment.item.id}:${w}`}
                      segment={segment}
                      week={week}
                      timezone={timezone}
                      onEventClick={onEventClick}
                    />
                  ))}
                {perDay.map((daySegments, c) => {
                  const hidden = daySegments.filter((s) => s.lane >= shown).length;
                  if (hidden === 0) return null;
                  const day = week[c]!;
                  const label = `+${hidden} more`;
                  return onSelectDate ? (
                    <PressTarget
                      key={`more:${c}`}
                      onClick={() => onSelectDate(day)}
                      aria-label={`${hidden} more on ${longDay(day)}`}
                      className={cn(
                        'pointer-events-auto mx-1 flex h-[22px] min-h-0 items-center rounded-fw-sm px-1.5 text-left font-fw-sans text-caption font-semibold text-text-secondary',
                        'underline-offset-2 hover:text-text-primary hover:underline',
                        COL_START[c],
                        ROW_START[shown],
                      )}
                    >
                      {label}
                    </PressTarget>
                  ) : (
                    <span
                      key={`more:${c}`}
                      className={cn('mx-1 flex items-center px-1.5 font-fw-sans text-caption font-semibold text-text-secondary', COL_START[c], ROW_START[shown])}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── A day's ground: its date strip (sm+), or the whole-cell target + dots
      on a phone. ────────────────────────────────────────────────────────── */
function DayCell({
  day,
  focusDate,
  nowRef,
  selectedDate,
  segments,
  overlayMode,
  onSelectDate,
}: {
  day: Date;
  focusDate: Date;
  nowRef?: Date;
  selectedDate?: Date;
  segments: MonthSegment[];
  overlayMode: boolean;
  onSelectDate?: (date: Date) => void;
}) {
  const inMonth = isSameMonth(day, focusDate);
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const sunken = weekend || !inMonth;
  const isToday = nowRef ? isSameDay(day, nowRef) : false;
  const isPast = nowRef ? day.getTime() < nowRef.getTime() && !isToday : false;
  const isSelected = !isToday && selectedDate ? isSameDay(day, selectedDate) : false;
  const count = segments.length;
  const noun = overlayMode ? (count === 1 ? 'item' : 'items') : count === 1 ? 'event' : 'events';
  const label = `${longDay(day)}, ${count === 0 ? 'nothing scheduled' : `${count} ${noun}`}${isToday ? ', today' : ''}`;
  // The first of a month names its month ("Oct 1") where a row crosses one.
  const dateText = day.getDate() === 1 ? format(day, 'MMM d') : String(day.getDate());

  const dots: Array<{ key: string; className?: string; style?: React.CSSProperties }> = [];
  for (const { item } of segments) {
    if (dots.length >= MAX_DOTS) break;
    const dot =
      item.kind === 'overlay'
        ? { key: `p:${item.overlay.playerName}`, style: { backgroundColor: item.overlay.color.bg } }
        : { key: `t:${typeMeta(item.event.event_type).label}`, className: typeToneClasses(item.event.event_type).dot };
    if (!dots.some((d) => d.key === dot.key)) dots.push(dot);
  }

  const disc = cn(
    'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-fw-sans text-caption font-semibold tabular-nums',
    isToday
      ? 'bg-accent-fill text-text-on-accent-fill'
      : isSelected
        ? 'bg-accent-wash text-accent-ink'
        : !inMonth
          ? 'text-text-tertiary'
          : isPast
            ? 'text-text-secondary'
            : 'text-text-primary',
  );

  return (
    <div
      data-day={localDayKey(day)}
      className={cn(
        'relative min-w-0 border-l border-border-subtle first:border-l-0',
        sunken ? 'bg-surface-sunken' : 'bg-surface',
      )}
    >
      {/* Phone: ONE target per day, the whole cell, named with what's on it. */}
      {onSelectDate ? (
        <PressTarget
          onClick={() => onSelectDate(day)}
          aria-label={label}
          aria-current={isToday ? 'date' : undefined}
          data-slot="month-day-cell"
          className="absolute inset-0 z-0 rounded-none focus-visible:ring-inset focus-visible:ring-offset-0 sm:hidden"
        />
      ) : null}
      <span aria-hidden className={cn('pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 sm:hidden', disc)}>
        {day.getDate()}
      </span>
      {dots.length > 0 ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1 sm:hidden">
          {dots.map((d) => (
            <span key={d.key} className={cn('h-1.5 w-1.5 rounded-full', d.className)} style={d.style} />
          ))}
        </span>
      ) : null}

      {/* sm and up: the date strip opens the day. */}
      {onSelectDate ? (
        <PressTarget
          onClick={() => onSelectDate(day)}
          aria-label={label}
          aria-current={isToday ? 'date' : undefined}
          data-slot="month-day-strip"
          className={cn(
            'group/date relative z-10 flex w-full items-center justify-start gap-1.5 rounded-none px-1.5 max-sm:hidden',
            'transition-colors focus-visible:ring-inset focus-visible:ring-offset-0',
            sunken
              ? 'hover:bg-[color:color-mix(in_oklch,var(--fw-color-surface-sunken)_72%,var(--fw-color-border-subtle))]'
              : 'hover:bg-surface-sunken',
          )}
          style={{ height: DATE_STRIP_PX }}
        >
          <span className={disc}>{dateText}</span>
          {isToday ? <span className="font-fw-sans text-caption font-semibold text-accent-ink">Today</span> : null}
          <ChevronRight
            aria-hidden
            className="ml-auto h-3.5 w-3.5 text-text-tertiary opacity-0 transition-opacity group-hover/date:opacity-100 group-focus-visible/date:opacity-100"
          />
        </PressTarget>
      ) : (
        <span className="flex items-center gap-1.5 px-1.5 max-sm:hidden" style={{ height: DATE_STRIP_PX }}>
          <span className={disc}>{dateText}</span>
          {isToday ? <span className="font-fw-sans text-caption font-semibold text-accent-ink">Today</span> : null}
        </span>
      )}
    </div>
  );
}

/* ── One placed item: a bar (all-day / multi-day) or a timed chip. ────── */
function MonthChip({
  segment,
  week,
  timezone,
  onEventClick,
}: {
  segment: MonthSegment;
  week: Date[];
  timezone?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const { item, startCol, endCol, lane, continuesBefore, continuesAfter } = segment;
  const days = week.slice(startCol, endCol + 1).map(localDayKey).join(' ');
  const place = cn(COL_START[startCol], COL_END[endCol], ROW_START[lane]);
  const base =
    'pointer-events-auto flex h-[22px] min-h-0 min-w-0 items-center gap-1 px-1.5 text-left font-fw-sans text-caption leading-4';

  if (item.kind === 'overlay') {
    const o = item.overlay;
    return (
      <span
        title={itemTitle(item)}
        data-days={days}
        className={cn(base, 'mx-1 rounded-fw-sm font-medium text-text-primary', place)}
        style={{ backgroundColor: o.color.light }}
      >
        <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: o.color.bg }} />
        {o.kind !== 'blocked' ? (
          <span className="flex-shrink-0 font-semibold tabular-nums">{formatEventTimeCompact(o.start, timezone)}</span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{o.title}</span>
      </span>
    );
  }

  const e = item.event;
  const cancelled = e.status === 'cancelled';
  const tone = typeToneClasses(e.event_type);
  const { label: typeLabel } = typeMeta(e.event_type);
  const onClick = onEventClick ? () => onEventClick(e) : undefined;

  if (item.bar) {
    const Icon = typeIcon(e.event_type);
    const spanDays = differenceInCalendarDays(item.last, item.first) + 1;
    const when = e.all_day ? 'all day' : dayGridRangeLabel(e, timezone);
    const range = spanDays > 1 ? `${longDay(item.first)} to ${longDay(item.last)}` : longDay(item.first);
    return (
      <PressTarget
        onClick={onClick}
        title={itemTitle(item)}
        data-days={days}
        data-testid="month-bar"
        aria-label={`${e.title}, ${typeLabel}, ${when}, ${range}${e.location ? `, ${e.location}` : ''}${cancelled ? ', cancelled' : ''}`}
        className={cn(
          base,
          'relative overflow-clip font-semibold',
          EVENT_SURFACE,
          cancelled ? CANCELLED_TONE_VARS : tone.vars,
          cancelled ? 'text-text-secondary line-through' : 'text-text-primary',
          continuesBefore ? 'ml-0 rounded-l-none' : 'ml-1 rounded-l-fw-sm pl-2.5',
          continuesAfter ? 'mr-0 rounded-r-none' : 'mr-1 rounded-r-fw-sm',
          place,
        )}
      >
        {continuesBefore ? (
          <ChevronLeft aria-hidden className="h-3.5 w-3.5 flex-shrink-0 text-text-secondary" />
        ) : (
          <>
            <span aria-hidden className={EVENT_BAR} />
            <Icon aria-hidden className="h-3.5 w-3.5 flex-shrink-0 text-[color:var(--ev-ink)]" />
          </>
        )}
        <span className="min-w-0 flex-1 truncate">{e.title}</span>
        {continuesAfter ? <ChevronRight aria-hidden className="h-3.5 w-3.5 flex-shrink-0 text-text-secondary" /> : null}
      </PressTarget>
    );
  }

  // A class chip wears its PLAYER's identity color (the same `tintFor(id)` as
  // their avatar), with their initials: a month of a roster's classes would
  // otherwise be one unreadable wall (coach report, 2026-08-05).
  const ownerTint = e.owner_player_id ? tintFor(e.owner_player_id) : null;
  const start = e.start_time || e.start_date;
  return (
    <PressTarget
      onClick={onClick}
      title={itemTitle(item)}
      data-days={days}
      aria-label={`${e.title}, ${typeLabel}, ${dayGridRangeLabel(e, timezone)}${e.owner_label ? `, ${e.owner_label}` : ''}${cancelled ? ', cancelled' : ''}`}
      style={!cancelled && ownerTint ? eventToneVars(e.event_type, { tint: ownerTint }) : undefined}
      className={cn(
        // A real flex row with `min-w-0`, and ONLY the title span shrinks:
        // a bare `truncate` on a two-child row squeezed the title to one
        // glyph before (finding #86).
        base,
        'relative mx-1 overflow-clip rounded-fw-sm pl-2.5 font-medium',
        EVENT_SURFACE,
        cancelled ? CANCELLED_TONE_VARS : ownerTint ? undefined : tone.vars,
        cancelled ? 'text-text-secondary line-through' : 'text-text-primary',
        place,
      )}
    >
      <span aria-hidden className={EVENT_BAR} />
      {!cancelled && e.owner_initials ? (
        <span aria-hidden className="flex-shrink-0 font-fw-sans text-microbadge font-bold tracking-[0.04em] text-[color:var(--ev-ink)]">
          {e.owner_initials}
        </span>
      ) : null}
      {start ? <span className="flex-shrink-0 font-semibold tabular-nums">{formatEventTimeCompact(start, timezone)}</span> : null}
      <span className="min-w-0 flex-1 truncate">{e.title}</span>
    </PressTarget>
  );
}
