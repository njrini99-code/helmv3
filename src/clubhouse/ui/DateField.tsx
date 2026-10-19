'use client';

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { haptic } from '../lib/haptics';
import { Icon } from './Icon';
import {
  DOW_SHORT, addMonths, clampDate, formatDate, formatMonth, localToday, monthGrid, moveDay, outOfRange, parseDateInput, parseIso,
} from './date-time';
import { PickerField } from './PickerHost';
import { Tooltip } from './Tooltip';

export interface DateFieldProps {
  /** `yyyy-mm-dd`, or empty for none: the same string the `<input type="date">` it replaces held. */
  value: string;
  onChange: (value: string) => void;
  /** "Start date": names the field for assistive tech and titles the phone sheet. */
  label: string;
  /** Days before and after these are shown but can't be picked. A typed day outside them still goes to `onChange`: the form's own message says why. */
  min?: string;
  max?: string;
  /** The month the picker opens on while the field is empty (an end date opens on its start). */
  anchor?: string;
  /** Adds Clear to the picker, for a field that may be left empty. */
  clearable?: boolean;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Takes the whole row on the phone, in a grid that gives the fields beside it a share. */
  row?: boolean;
  placeholder?: string;
  name?: string;
  /** Today, for the marker and the typed shortcuts; the device's own day when omitted. */
  today?: string;
  /** 0 for Sunday first (the calendar's week), 1 for Monday. */
  weekStart?: number;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'data-ch-code'?: string;
}

const HINT = 'Try 10/15, oct 15 or tomorrow.';

/**
 * A date as the app writes it ("Thu 15 Oct 2026"), typable on desktop and chosen from a month on both: a popover under the
 * field on desktop, a bottom sheet on the phone. In place of `<input type="date">` and its browser chrome; the value, min and
 * max keep that input's meaning. Typing reads "10/15", "oct 15", "15 oct", "tomorrow", "fri" (see parseDateInput).
 */
export function DateField(props: DateFieldProps) {
  const { value, min, max } = props;
  const [today, setToday] = useState(props.today ?? '');
  return (
    <PickerField
      value={value}
      onChange={props.onChange}
      label={props.label}
      icon={CalendarDays}
      format={(v) => formatDate(v)}
      parse={(t) => parseDateInput(t, { today: props.today ?? localToday(), min, max })}
      isMachine={(t) => /^\d{4}-\d{2}-\d{2}$/.test(t)}
      hint={HINT}
      pickLabel="Pick a date"
      panelWidth={288}
      placeholder={props.placeholder ?? 'Pick a date'}
      id={props.id}
      className={props.className}
      disabled={props.disabled}
      row={props.row}
      clearable={props.clearable}
      name={props.name}
      onOpen={() => setToday(props.today ?? localToday())}
      ariaInvalid={props['aria-invalid']}
      ariaDescribedBy={props['aria-describedby']}
      dataChCode={props['data-ch-code']}
      extra={{ 'data-min': min || undefined, 'data-max': max || undefined }}
      render={({ pick, clear, phone, grab }) => (
        <MonthGrid
          value={value}
          min={min}
          max={max}
          anchor={props.anchor}
          today={today || localToday()}
          weekStart={props.weekStart ?? 0}
          phone={phone}
          grab={grab}
          onPick={pick}
          onClear={clear}
        />
      )}
    />
  );
}

/** A month of days to choose from. Arrows move by day and week, PageUp and PageDown by month, Home and End to the week's ends. */
export function MonthGrid({
  value, min, max, anchor, today, weekStart, phone, grab, onPick, onClear,
}: {
  value: string;
  min?: string;
  max?: string;
  anchor?: string;
  today: string;
  weekStart: number;
  phone: boolean;
  /** Focus moves into the grid as it opens (a keyboard open); false leaves it where it is (a click in the text). */
  grab: boolean;
  onPick: (iso: string) => void;
  onClear?: () => void;
}) {
  const start = parseIso(value)
    ? value
    : clampDate(parseIso(anchor) ? anchor! : today, min, max);
  const [cursor, setCursor] = useState(start);
  const grid = useRef<HTMLDivElement | null>(null);
  // Focus follows the cursor once the picker has been used from the keyboard (and on open on desktop); a tap never pulls it.
  const wantFocus = useRef(!phone && grab);
  useEffect(() => {
    if (!wantFocus.current) return;
    grid.current?.querySelector<HTMLElement>(`[data-date="${cursor}"]`)?.focus({ preventScroll: true });
  }, [cursor]);

  // Text that was typed and understood moves the month and the cursor to it.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    if (parseIso(value)) setCursor(value);
  }

  const go = (to: string) => {
    wantFocus.current = true;
    setCursor(to);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = moveDay(cursor, e.key, { min, max, shift: e.shiftKey, weekStart });
    if (to === null) return;
    e.preventDefault();
    if (to !== cursor) {
      haptic('select');
      go(to);
    }
  };

  const weeks = monthGrid(cursor, weekStart);
  const shown = cursor.slice(0, 7);
  const firstOfShown = `${shown}-01`;
  const prevDisabled = !!min && addMonths(firstOfShown, -1).slice(0, 7) < min.slice(0, 7);
  const nextDisabled = !!max && addMonths(firstOfShown, 1).slice(0, 7) > max.slice(0, 7);
  const heads = Array.from({ length: 7 }, (_, i) => DOW_SHORT[(weekStart + i) % 7]!);
  const todayOk = !outOfRange(today, min, max);

  return (
    <div className={'ch-df-cal' + (phone ? ' is-phone' : '')}>
      <div className="ch-df-cal__head">
        <Tooltip>
          <button
            type="button"
            className="ch-df-nav"
            aria-label="Previous month"
            disabled={prevDisabled}
            onClick={() => {
              haptic('select');
              wantFocus.current = false;
              setCursor(clampDate(addMonths(cursor, -1), min, max));
            }}
          >
            <Icon icon={ChevronLeft} size={16} />
          </button>
        </Tooltip>
        <div className="ch-df-cal__month" aria-live="polite">
          {formatMonth(cursor)}
        </div>
        <Tooltip>
          <button
            type="button"
            className="ch-df-nav"
            aria-label="Next month"
            disabled={nextDisabled}
            onClick={() => {
              haptic('select');
              wantFocus.current = false;
              setCursor(clampDate(addMonths(cursor, 1), min, max));
            }}
          >
            <Icon icon={ChevronRight} size={16} />
          </button>
        </Tooltip>
      </div>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the day buttons are the tab stop; the grid only routes keys */}
      <div ref={grid} role="grid" aria-label={formatMonth(cursor)} className="ch-df-cal__grid" onKeyDown={onKey}>
        <div role="row" className="ch-df-cal__dow">
          {heads.map((h) => (
            <span key={h} role="columnheader" aria-label={h} className="ch-df-cal__h">
              {h.slice(0, 2)}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]!.date} role="row" className="ch-df-cal__week">
            {week.map((cell) => {
              const off = outOfRange(cell.date, min, max);
              const on = cell.date === value;
              const day = Number(cell.date.slice(8));
              return (
                <span key={cell.date} role="gridcell" aria-selected={on} className="ch-df-cal__cell">
                  <button
                    type="button"
                    data-date={cell.date}
                    tabIndex={cell.date === cursor ? 0 : -1}
                    disabled={off}
                    aria-label={formatDate(cell.date)}
                    aria-current={cell.date === today ? 'date' : undefined}
                    className={'ch-df-day ch-num' + (on ? ' is-on' : '') + (cell.date === today ? ' is-today' : '') + (cell.inMonth ? '' : ' is-out')}
                    onClick={() => onPick(cell.date)}
                    onFocus={() => setCursor(cell.date)}
                  >
                    {day}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {(todayOk || onClear) && (
        <div className="ch-df-cal__foot">
          {todayOk && (
            <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={() => onPick(today)}>
              Today
            </button>
          )}
          {onClear && (
            <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
