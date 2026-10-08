'use client';

import { createContext, useContext, useMemo, useRef, type HTMLAttributes, type TableHTMLAttributes, type ThHTMLAttributes } from 'react';
import { DayButton as RdpDayButton, DayPicker, type ClassNames, type CustomComponents, type DayButtonProps, type DayProps, type Formatters, type WeekProps } from 'react-day-picker';
import { haptic } from '../../lib/haptics';
import { addMonths, dayNum, dowOf, isMajor, monthName, type ChCalEvent } from './model';
import type { ChNow } from './views';

/**
 * The phone's Month (board: Coach - Calendar - Mobile.html, m-cal.jsx) on react-day-picker: the library keeps the
 * weeks, today, the chosen day and the keyboard (the arrows walk the days and cross into the next month, Page Up and
 * Page Down turn a month, Home and End reach the week's ends), and Clubhouse draws every element. Dates stay the
 * Calendar's team-timezone calendar dates (YYYY-MM-DD): each crosses into a Date at local noon only to be laid out, and
 * comes back by its local fields, so the browser's zone never moves a day. Weeks start on Sunday, as `monthCells` does.
 */

const pad = (n: number) => String(n).padStart(2, '0');
/** A calendar date as a Date the grid can lay out: local noon, so no zone or DST edge moves it to another day. */
export const dateOfDay = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12);
};
/** Back to the calendar date, by the Date's local fields (never toISOString, which would read UTC). */
export const dayOfDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

interface ChDayMarks {
  n: number;
  major: boolean;
}
const Marks = createContext<Map<string, ChDayMarks>>(new Map());

/** A horizontal swipe this far (and plainly more across than down) turns the month. */
const SWIPE_PX = 48;

const CLASSES: Partial<ClassNames> = {
  root: 'ch-calm-month__dp',
  months: 'ch-calm-month__ms',
  month: 'ch-calm-month__m',
  month_caption: 'ch-sr-only',
  caption_label: '',
  month_grid: 'ch-calm-month__grid',
  weekdays: 'ch-calm-month__h',
  weekday: '',
  weeks: 'ch-calm-month__g',
  week: 'ch-calm-month__w',
  day: 'ch-calm-month__d',
  day_button: 'ch-calm-month__c',
  today: '',
  selected: '',
  outside: '',
  focused: '',
  disabled: '',
  hidden: '',
};

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const FORMATTERS: Partial<Formatters> = { formatWeekdayName: (date) => WEEKDAY[date.getDay()]! };

/**
 * Clubhouse markup for the grid: one 7-column row per week under the weekdays' engraved rule, with the grid's ARIA
 * roles on plain elements (a table changed to a CSS grid loses its semantics in WebKit). Module scope, so each render
 * keeps the same components and the focused day keeps its focus.
 */
const COMPONENTS: Partial<CustomComponents> = {
  MonthGrid: ({ children, ...rest }: TableHTMLAttributes<HTMLTableElement>) => (
    <div {...(rest as HTMLAttributes<HTMLDivElement>)} role="grid">
      {children}
    </div>
  ),
  Weekdays: ({ children, ...rest }: HTMLAttributes<HTMLTableRowElement>) => (
    <div {...(rest as HTMLAttributes<HTMLDivElement>)} role="row" aria-hidden="true">
      {children}
    </div>
  ),
  Weekday: ({ children, scope: _scope, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) => (
    <span {...(rest as HTMLAttributes<HTMLSpanElement>)} role="columnheader">
      {children}
    </span>
  ),
  Weeks: ({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) => (
    <div {...(rest as HTMLAttributes<HTMLDivElement>)} role="rowgroup">
      {children}
    </div>
  ),
  Week: ({ children, week: _week, ...rest }: WeekProps) => (
    <div {...(rest as HTMLAttributes<HTMLDivElement>)} role="row">
      {children}
    </div>
  ),
  Day: ({ children, day: _day, modifiers: _modifiers, ...rest }: DayProps) => <div {...rest}>{children}</div>,
  DayButton: MonthDay,
};

/** A day: its number in the disc (today filled green, the chosen day ringed green) and a dot for its events, the dark dot for a competition. */
function MonthDay({ day, modifiers, className, children, ...rest }: DayButtonProps) {
  const date = dayOfDate(day.date);
  const marks = useContext(Marks).get(date);
  const n = marks?.n ?? 0;
  const cls = [className, modifiers.outside && 'is-out', modifiers.today && 'is-today', modifiers.selected && 'is-on'].filter(Boolean).join(' ');
  return (
    <RdpDayButton
      {...rest}
      day={day}
      modifiers={modifiers}
      className={cls}
      aria-label={`${dowOf(date)} ${dayNum(date)} ${monthName(date)}: ${n ? `${n} ${n === 1 ? 'event' : 'events'}${marks?.major ? ', competition' : ''}` : 'no events'}`}
    >
      <b className="ch-num">{children}</b>
      {marks?.major ? <i className="is-major" /> : n ? <i /> : null}
    </RdpDayButton>
  );
}

/**
 * The month grid with the legend. A day opens its Day view. The month turns a month at a time with a swipe across the
 * grid, with the keyboard inside it (the arrows past either end, Page Up and Page Down) and with the Calendar's arrow
 * keys from outside it, all through the Calendar's own `step` (one tick, and a second turn while the next window loads
 * steps on from the month it is headed to). A longer jump from the keyboard (Shift with Page Up or Down, a year) goes
 * straight to that month.
 */
export function MonthGrid({
  anchor,
  events,
  now,
  onPick,
  onStep,
  onMonth,
}: {
  anchor: string;
  events: ChCalEvent[];
  now: ChNow;
  onPick: (date: string) => void;
  onStep: (dir: 1 | -1) => void;
  onMonth: (date: string) => void;
}) {
  const marks = useMemo(() => {
    const by = new Map<string, ChDayMarks>();
    for (const e of events) {
      if (e.type === 'class' || e.type === 'busy') continue;
      const m = by.get(e.date) ?? { n: 0, major: false };
      by.set(e.date, { n: m.n + 1, major: m.major || isMajor(e.type) });
    }
    return by;
  }, [events]);
  const turn = (date: string) => {
    if (date === addMonths(anchor, 1)) return onStep(1);
    if (date === addMonths(anchor, -1)) return onStep(-1);
    haptic('select');
    onMonth(date);
  };

  // A swipe across the grid turns the month. The page only scrolls up and down here (touch-action: pan-y), so a
  // sideways finger stays with the grid; the tap that a swipe ends on never opens a day.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  return (
    <section
      className="ch-calm-month"
      aria-label={monthName(anchor)}
      onPointerDown={(e) => {
        swiped.current = false;
        swipe.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(e.clientY - s.y) * 1.5) return;
        swiped.current = true;
        onStep(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        swipe.current = null;
      }}
      onClickCapture={(e) => {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Marks.Provider value={marks}>
        <DayPicker
          mode="single"
          required
          selected={dateOfDay(anchor)}
          onSelect={(_, picked) => {
            haptic('select');
            onPick(dayOfDate(picked));
          }}
          month={dateOfDay(anchor)}
          onMonthChange={(m) => turn(dayOfDate(m))}
          today={dateOfDay(now.date)}
          weekStartsOn={0}
          showOutsideDays
          hideNavigation
          classNames={CLASSES}
          formatters={FORMATTERS}
          components={COMPONENTS}
        />
      </Marks.Provider>
      <div className="ch-calm-month__lg" aria-hidden="true">
        <span>
          <i className="is-major" />
          Competition
        </span>
        <span>
          <i />
          Practice or meeting
        </span>
      </div>
    </section>
  );
}
