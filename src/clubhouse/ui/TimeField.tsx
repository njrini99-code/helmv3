'use client';

import { Clock } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { haptic } from '../lib/haptics';
import { useChClock } from '../lib/use-clock';
import { formatTime, parseHm, parseTimeInput, timeSlots } from './date-time';
import { PickerField } from './PickerHost';

export interface TimeFieldProps {
  /** `HH:mm` (24-hour), or empty for none: the same string the `<input type="time">` it replaces held. */
  value: string;
  onChange: (value: string) => void;
  /** "Start time": names the field for assistive tech and titles the phone sheet. */
  label: string;
  /** Minutes between the times the list offers (the input's `step` in seconds, over 60). 15 by default. */
  stepMinutes?: number;
  /** Times before and after these are shown but can't be picked. A typed time outside them still goes to `onChange`. */
  min?: string;
  max?: string;
  clearable?: boolean;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Takes the whole row on the phone, in a grid that gives the fields beside it a share. */
  row?: boolean;
  placeholder?: string;
  name?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'data-ch-code'?: string;
}

const HINT = { '12': 'Try 3p, 3:30 pm or 1530.', '24': 'Try 15:30, 1530 or 3:30 pm.' } as const;

/**
 * A time as the calendar writes it ("3:30 PM", or "15:30" when the device reads 24 hours: Settings › Time format), typable
 * on desktop and chosen from a list on both. In place of `<input type="time">`: the value is `HH:mm` whichever clock is
 * shown, and the list steps by quarter hours, snapping as it scrolls. A value off the grid (a class at 3:05) shows as
 * chosen and stays where it is until another is picked. Typing takes either clock whichever one is shown.
 */
export function TimeField(props: TimeFieldProps) {
  const { value, min, max } = props;
  const step = props.stepMinutes ?? 15;
  const clock = useChClock();
  return (
    <PickerField
      value={value}
      onChange={props.onChange}
      label={props.label}
      icon={Clock}
      format={(v) => formatTime(v, clock)}
      parse={(t) => parseTimeInput(t)}
      isMachine={(t) => /^\d{2}:\d{2}$/.test(t)}
      hint={HINT[clock]}
      pickLabel="Pick a time"
      panelWidth={176}
      placeholder={props.placeholder ?? 'Pick a time'}
      id={props.id}
      className={props.className}
      disabled={props.disabled}
      row={props.row}
      clearable={props.clearable}
      name={props.name}
      ariaInvalid={props['aria-invalid']}
      ariaDescribedBy={props['aria-describedby']}
      dataChCode={props['data-ch-code']}
      extra={{ 'data-min': min || undefined, 'data-max': max || undefined }}
      render={({ pick, clear, phone, grab }) => <TimeList value={value} step={step} min={min} max={max} phone={phone} grab={grab} onPick={pick} onClear={clear} />}
    />
  );
}

/** The day by `step` minutes, scrolled to the chosen time and snapping to rows. Arrows move, Enter chooses. */
export function TimeList({
  value, step, min, max, phone, grab, onPick, onClear,
}: {
  value: string;
  step: number;
  min?: string;
  max?: string;
  phone: boolean;
  /** Focus moves into the list as it opens (a keyboard open); false leaves it where it is (a click in the text). */
  grab: boolean;
  onPick: (value: string) => void;
  onClear?: () => void;
}) {
  const clock = useChClock();
  const slots = timeSlots(step, value);
  const lo = parseHm(min);
  const hi = parseHm(max);
  const allowed = (s: string) => {
    const t = parseHm(s) ?? 0;
    return (lo === null || t >= lo) && (hi === null || t <= hi);
  };
  // Where the list starts: the chosen time, else the first free slot at or after 9 AM that the range allows.
  const first = slots.includes(value) ? value : (slots.find((s) => (parseHm(s) ?? 0) >= 9 * 60 && allowed(s)) ?? slots.find(allowed) ?? slots[0]!);
  const [cursor, setCursor] = useState(first);
  const list = useRef<HTMLDivElement | null>(null);
  // Text that was typed and understood moves the cursor to it.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    if (slots.includes(value)) setCursor(value);
  }
  const wantFocus = useRef(!phone && grab);

  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(`[data-time="${cursor}"]`);
    if (!row) return;
    if (wantFocus.current) row.focus({ preventScroll: true });
    row.scrollIntoView?.({ block: 'center' });
  }, [cursor]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const free = slots.filter(allowed);
    const at = free.indexOf(cursor);
    const per = Math.round(60 / step) || 1;
    const jump = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'PageDown' ? per : e.key === 'PageUp' ? -per : 0;
    let next: string | undefined;
    if (jump) next = free[Math.max(0, Math.min(free.length - 1, (at < 0 ? 0 : at) + jump))];
    else if (e.key === 'Home') next = free[0];
    else if (e.key === 'End') next = free[free.length - 1];
    else return;
    e.preventDefault();
    if (next && next !== cursor) {
      haptic('select');
      wantFocus.current = true;
      setCursor(next);
    }
  };

  return (
    <div className={'ch-tf' + (phone ? ' is-phone' : '')}>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the rows are the tab stop; the list only routes keys */}
      <div ref={list} role="listbox" aria-label="Times" className="ch-tf__list" onKeyDown={onKey}>
        {slots.map((s) => {
          const on = s === value;
          return (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={on}
              data-time={s}
              tabIndex={s === cursor ? 0 : -1}
              disabled={!allowed(s)}
              className={'ch-tf__row ch-num' + (on ? ' is-on' : '')}
              onClick={() => onPick(s)}
              onFocus={() => setCursor(s)}
            >
              {formatTime(s, clock)}
            </button>
          );
        })}
      </div>
      {onClear && (
        <div className="ch-tf__foot">
          <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={onClear}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
