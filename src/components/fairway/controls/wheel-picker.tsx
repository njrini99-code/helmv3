'use client';

/**
 * ============================================================================
 * Fairway · controls · WheelPicker / TimeWheel
 * ----------------------------------------------------------------------------
 * The iOS Clock "drum": scrollable columns whose centre row is the value,
 * with one continuous selection band across every column (hour · minute ·
 * AM/PM). Requested for the calendar's event-time fields on BOTH desktop and
 * mobile (owner screenshot, 2026-09-10) in place of the 96-row list.
 *
 * Mechanics:
 *   • Native scrolling with `scroll-snap-type: y mandatory` per column, so
 *     flicks settle on a row the way the OS drum does; `overscroll-behavior:
 *     contain` stops a spun column dragging the popover/page with it.
 *   • The value COMMITS on scroll-settle, never mid-scroll — committing while
 *     the user is still flicking would re-scroll the column under their thumb.
 *     Safari has no `scrollend`, so settle is a short debounce after the last
 *     `scroll` event.
 *   • Tapping a row centres it (and therefore selects it). Each column is a
 *     keyboard `listbox`: ↑/↓ step, PgUp/PgDn jump, Home/End, with the value
 *     announced through `aria-activedescendant`.
 *   • Reduced motion: programmatic scrolls jump instead of glide; the row
 *     emphasis still updates (it is state, not animation).
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import styles from './wheel-picker.module.css';

/** Must match `--wp-item-h` / `--wp-rows` in wheel-picker.module.css. */
export const WHEEL_ITEM_HEIGHT = 44;
export const WHEEL_VISIBLE_ROWS = 5;
/** Quiet period after the last scroll event before the centre row commits. */
const SETTLE_MS = 90;

export interface WheelOption<T extends string | number> {
  value: T;
  label: string;
}

export interface WheelColumnProps<T extends string | number> {
  options: ReadonlyArray<WheelOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the column ("Hour", "Minute", "AM or PM"). */
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function WheelColumn<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
  className,
}: WheelColumnProps<T>) {
  const id = React.useId();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const settleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while WE are scrolling the column to reflect a prop change, so the
   *  resulting scroll events do not commit a stale intermediate row. */
  const programmatic = React.useRef(false);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [centreIndex, setCentreIndex] = React.useState(selectedIndex);

  const scrollToIndex = React.useCallback((index: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    const top = index * WHEEL_ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - top) < 1) return;
    programmatic.current = true;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
    } else {
      // Older WebViews / jsdom: no options-form scrollTo.
      el.scrollTop = top;
    }
  }, []);

  // Reflect the controlled value: on mount jump (no glide from midnight), on
  // later changes glide unless reduced motion is set.
  const mounted = React.useRef(false);
  React.useLayoutEffect(() => {
    scrollToIndex(selectedIndex, mounted.current);
    setCentreIndex(selectedIndex);
    mounted.current = true;
  }, [selectedIndex, scrollToIndex]);
  // A popover positions its content a frame after mount; re-sync once the
  // column has its final box so the drum never opens on the wrong row.
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => scrollToIndex(selectedIndex, false));
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indexFromScroll = React.useCallback(() => {
    const el = ref.current;
    if (!el) return selectedIndex;
    const raw = Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT);
    return Math.min(options.length - 1, Math.max(0, raw));
  }, [options.length, selectedIndex]);

  const handleScroll = React.useCallback(() => {
    const next = indexFromScroll();
    setCentreIndex(next);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      const settled = indexFromScroll();
      const wasOurs = programmatic.current;
      programmatic.current = false;
      // Our own glide settling on the row the prop asked for is not a user
      // choice. Anything else — including a glide the user grabbed mid-way —
      // is where their thumb left the drum, and commits.
      if (wasOurs && settled === selectedIndex) return;
      const option = options[settled];
      if (option && option.value !== value) onChange(option.value);
    }, SETTLE_MS);
  }, [indexFromScroll, onChange, options, selectedIndex, value]);

  React.useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const step = (delta: number) => {
    const next = Math.min(options.length - 1, Math.max(0, selectedIndex + delta));
    if (next === selectedIndex) return;
    onChange(options[next]!.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        step(-1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        step(1);
        break;
      case 'PageUp':
        event.preventDefault();
        step(-5);
        break;
      case 'PageDown':
        event.preventDefault();
        step(5);
        break;
      case 'Home':
        event.preventDefault();
        step(-options.length);
        break;
      case 'End':
        event.preventDefault();
        step(options.length);
        break;
      default:
    }
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={`${id}-${selectedIndex}`}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      className={cn(styles.column, className)}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      data-testid="wheel-column"
    >
      <div className={styles.pad} aria-hidden />
      {options.map((option, index) => {
        const distance = Math.min(3, Math.abs(index - centreIndex));
        const selected = index === selectedIndex;
        return (
          // Keyboard lives on the listbox (aria-activedescendant pattern):
          // the rows are not individually focusable, by design.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
          <div
            key={String(option.value)}
            id={`${id}-${index}`}
            role="option"
            aria-selected={selected}
            data-distance={distance}
            data-selected={selected || undefined}
            className={styles.item}
            onClick={() => {
              if (disabled) return;
              if (option.value !== value) onChange(option.value);
              else scrollToIndex(index, true);
            }}
          >
            {option.label}
          </div>
        );
      })}
      <div className={styles.pad} aria-hidden />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TimeWheel — hour · minute · AM/PM                                          */
/* -------------------------------------------------------------------------- */

export interface TimeWheelProps {
  /** 24h "HH:MM". `null` renders the wheel at the fallback time. */
  value: string | null;
  onChange: (hhmm: string) => void;
  /** Minute granularity. Default 1, like the OS clock. */
  minuteStep?: 1 | 5 | 10 | 15;
  /** Shown when `value` is null. Default "09:00". */
  fallback?: string;
  disabled?: boolean;
  className?: string;
}

const HOURS: ReadonlyArray<WheelOption<number>> = Array.from({ length: 12 }, (_, i) => ({
  value: i === 0 ? 12 : i,
  label: String(i === 0 ? 12 : i),
}));

const PERIODS: ReadonlyArray<WheelOption<'AM' | 'PM'>> = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

function parseHhmm(hhmm: string): { h24: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h24 = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h24) || !Number.isFinite(m) || h24 > 23 || m > 59) return null;
  return { h24, m };
}

export function TimeWheel({
  value,
  onChange,
  minuteStep = 1,
  fallback = '09:00',
  disabled,
  className,
}: TimeWheelProps) {
  const parsed = parseHhmm(value ?? '') ?? parseHhmm(fallback) ?? { h24: 9, m: 0 };
  const period: 'AM' | 'PM' = parsed.h24 >= 12 ? 'PM' : 'AM';
  const hour12 = parsed.h24 % 12 === 0 ? 12 : parsed.h24 % 12;
  // Snap an off-grid minute (e.g. "09:07" on a 5-minute wheel) down to the
  // nearest offered row rather than rendering nothing selected.
  const minute = parsed.m - (parsed.m % minuteStep);

  const minutes = React.useMemo<ReadonlyArray<WheelOption<number>>>(
    () =>
      Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => ({
        value: i * minuteStep,
        label: String(i * minuteStep).padStart(2, '0'),
      })),
    [minuteStep],
  );

  const emit = (h12: number, m: number, p: 'AM' | 'PM') => {
    const h24 = (h12 % 12) + (p === 'PM' ? 12 : 0);
    onChange(`${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  return (
    <div className={cn(styles.wheel, className)} data-testid="time-wheel">
      <div className={styles.band} aria-hidden />
      <WheelColumn
        options={HOURS}
        value={hour12}
        onChange={(h) => emit(h, minute, period)}
        ariaLabel="Hour"
        disabled={disabled}
        className="w-[4.25rem]"
      />
      <WheelColumn
        options={minutes}
        value={minute}
        onChange={(m) => emit(hour12, m, period)}
        ariaLabel="Minute"
        disabled={disabled}
        className="w-[4.25rem]"
      />
      <WheelColumn
        options={PERIODS}
        value={period}
        onChange={(p) => emit(hour12, minute, p)}
        ariaLabel="AM or PM"
        disabled={disabled}
        className="w-[4.5rem]"
      />
    </div>
  );
}
