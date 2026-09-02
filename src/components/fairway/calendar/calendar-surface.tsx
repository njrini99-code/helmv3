'use client';

/**
 * ============================================================================
 * Fairway · calendar · CalendarSurface (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * The warm-styled month grid — the Fairway calendar primitive built on
 * react-day-picker v10 (headless behavior: keyboard nav, selection modes,
 * locale, ARIA) skinned to the locked design tokens.
 *
 *   • Matte warm Surface by default (DESIGN-SYSTEM.md §4.2). Opt into the
 *     RESTRAINED Liquid Glass material with `glass` ONLY in floating contexts
 *     (the DatePicker popover does this) — never as a resting card (§4.3).
 *   • today / selected / range (start/middle/end) states in helm green; event
 *     dots for month overviews.
 *   • Temporal continuity: the month grid slides in the direction of travel
 *     (next → from the future/right, prev → from the past/left), honoring
 *     prefers-reduced-motion (§7.1/§7.3).
 *   • Localizable: pass a `locale` from `react-day-picker/locale`, `dir="rtl"`,
 *     `weekStartsOn`, `numerals`, custom `formatters` — all flow through.
 *   • Full keyboard + visible green focus ring that survives cream AND the dark
 *     popover scrim (§7.2). WCAG 2.2: every day target >= 24px CSS.
 *
 * Composable: `className` is merged last-wins via cn(); every slot is tweakable
 * through the `classNames` prop (deep-merged after the warm defaults). Adopts
 * the `data-slot` convention used by the other Fairway primitives.
 * ========================================================================== */

import * as React from 'react';
import {
  DayPicker,
  getDefaultClassNames,
  type DayButtonProps,
  type ChevronProps,
} from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './calendar.module.css';
import type {
  CalendarSurfaceProps,
  CalendarSize,
  TemporalDirection,
} from './types';

/* -------------------------------------------------------------------------- */
/* Per-size geometry — every size keeps the day target >= 24px CSS (WCAG 2.2). */
/* -------------------------------------------------------------------------- */
const SIZE_CELL: Record<CalendarSize, string> = {
  compact: 'h-9 w-9 text-[13px]', // 36px — dense month overviews
  cozy: 'h-10 w-10 text-[14px]', // 40px — default
  comfortable: 'h-11 w-11 text-[15px]', // 44px — touch-first
};

/* -------------------------------------------------------------------------- */
/* Warm-skinned chevron (left/right) + day button custom components.          */
/* -------------------------------------------------------------------------- */
/**
 * Pull a representative Date out of whatever a DayPicker date-ish prop holds.
 *
 * `selected` is `Date` in single mode, `Date[]` in multiple, and
 * `{ from, to }` in range — and `month` / `defaultMonth` are plain Dates. This
 * only needs to identify a MONTH to compare against, so the first real Date in
 * any of those shapes is enough, and a runtime check avoids narrowing the
 * generic `mode` union at every call site.
 *
 * Returns null rather than a fallback so the caller decides the default.
 */
function firstDateOf(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const d = firstDateOf(item);
      if (d) return d;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    // DateRange — `from` may be set with `to` still undefined mid-selection.
    const range = value as { from?: unknown; to?: unknown };
    return firstDateOf(range.from) ?? firstDateOf(range.to);
  }
  return null;
}

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
  return <Icon className={cn('h-4 w-4', className)} aria-hidden="true" />;
}

function CalendarDayButton({
  // `day` is react-day-picker's CalendarDay instance — destructured out so it is
  // NOT spread onto the DOM <button>; not otherwise needed here.
  day: _day,
  modifiers,
  className,
  ...props
}: DayButtonProps) {
  // Mark event days for the CSS-module dot; expose selection for the dot color.
  const isEvent = Boolean(modifiers?.event);
  return (
    // Headless react-day-picker DayButton override — must render a real
    // <button> for keyboard nav/ARIA; the app's <Button> wrapper is intentionally
    // not used (this primitive group is self-contained, no external imports).
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      data-selected={modifiers?.selected ? 'true' : undefined}
      className={cn(
        styles.dayButton,
        isEvent && styles.eventDay,
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* CalendarSurface                                                             */
/* -------------------------------------------------------------------------- */
export const CalendarSurface = React.forwardRef<
  HTMLDivElement,
  CalendarSurfaceProps
>(function CalendarSurface(
  {
    size = 'cozy',
    eventDays,
    toolbar,
    glass = false,
    className,
    classNames,
    modifiers,
    modifiersClassNames,
    onMonthChange,
    components,
    ...dayPickerProps
  },
  ref,
) {
  const defaults = getDefaultClassNames();
  const cell = SIZE_CELL[size];

  // Track travel direction so the grid can slide the way time moves.
  const [direction, setDirection] = React.useState<TemporalDirection>('next');
  const prevMonthRef = React.useRef<Date | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  /*
   * REPLAY THE ENTRANCE ANIMATION WITHOUT REMOUNTING THE GRID.
   *
   * This used to bump a `key` on the wrapper div. That div contains
   * <DayPicker>, and DayPicker is UNCONTROLLED here — no `month` or
   * `defaultMonth` prop is passed, so it holds the displayed month in its own
   * internal state. Changing the key unmounted and remounted it, discarding
   * that state and snapping the view back to the month derived from
   * `selected`.
   *
   * So every arrow click advanced the month and instantly reverted it. From
   * the user's side the nav simply did nothing — reported from Shenandoah
   * 2026-08-19 as "calendar is glitching and won't let him change months",
   * with the picker stuck on the selected date's month.
   *
   * The remount also destroyed the focused nav button on every click, so a
   * keyboard user had to re-find the arrow each time.
   *
   * Restarting a CSS animation needs the class removed, a reflow forced, then
   * the class re-added — assigning the same class name again is a no-op
   * because nothing changed from the browser's point of view. Doing it on a
   * ref keeps DayPicker mounted, so its month state and the DOM focus both
   * survive.
   */
  const replayEnterAnimation = React.useCallback((dir: TemporalDirection) => {
    const el = gridRef.current;
    const cls = dir === 'next' ? styles.enterNext : styles.enterPrev;
    if (!el || !cls) return;
    const other = dir === 'next' ? styles.enterPrev : styles.enterNext;
    if (other) el.classList.remove(other);
    el.classList.remove(cls);
    // Force a reflow so the removal is committed before the re-add; without
    // this the browser coalesces both mutations and the animation never
    // restarts.
    void el.offsetWidth;
    el.classList.add(cls);
  }, []);

  /*
   * The month the grid STARTED on, so the very first arrow click knows which
   * way it travelled.
   *
   * `prevMonthRef` is only ever written in `handleMonthChange`, so on the first
   * call there was nothing to compare against and the direction fell back to
   * the 'next' default — clicking BACK first slid the grid forwards. Cosmetic,
   * but wrong every time a coach's first move is backwards.
   *
   * Resolution order month → defaultMonth → selected → today. NOTE this is NOT
   * DayPicker's own order: getInitialMonth (react-day-picker 10.0.1,
   * helpers/getInitialMonth.js) is literally `month || defaultMonth || today`
   * and never consults `selected`. This comment claimed it mirrored DayPicker
   * until 2026-09-01. It does not, and that difference WAS the bug fixed
   * below — the seed here happened to be right while DayPicker's was wrong. Read through a
   * runtime helper rather than by narrowing the generic `mode` union: `selected`
   * is Date | Date[] | DateRange depending on mode, and type-narrowing that here
   * would cost far more than the animation is worth.
   */
  const seedMonth = React.useCallback((): Date => {
    const props = dayPickerProps as {
      month?: unknown;
      defaultMonth?: unknown;
      selected?: unknown;
    };
    return (
      firstDateOf(props.month) ??
      firstDateOf(props.defaultMonth) ??
      firstDateOf(props.selected) ??
      new Date()
    );
     
  }, [dayPickerProps]);

  const handleMonthChange = React.useCallback(
    (month: Date) => {
      // Falling back to the seed means direction is ALWAYS computed, so the
      // `if (prev)` branch that silently defaulted to 'next' is gone.
      const prev = prevMonthRef.current ?? seedMonth();
      const dir: TemporalDirection =
        month.getTime() >= prev.getTime() ? 'next' : 'prev';
      setDirection(dir);
      prevMonthRef.current = month;
      replayEnterAnimation(dir);
      onMonthChange?.(month);
    },
    [onMonthChange, replayEnterAnimation, seedMonth],
  );

  // Merge caller modifiers with the eventDays matcher (drives the dot).
  const mergedModifiers = React.useMemo(
    () => ({
      ...(modifiers ?? {}),
      ...(eventDays ? { event: eventDays } : {}),
    }),
    [modifiers, eventDays],
  );

  return (
    <div
      ref={ref}
      data-slot="calendar-surface"
      data-glass={glass ? '' : undefined}
      className={cn(
        'inline-block rounded-card p-4 font-fw-sans text-text-primary',
        // Matte warm Surface by default; border OR shadow, never both at rest.
        glass
          ? 'bg-elevated/0' // glass painted by the parent popover wrapper
          : 'border border-border-subtle bg-surface',
        className,
      )}
    >
      {toolbar ? (
        <div data-slot="calendar-toolbar" className="mb-3 px-1">
          {toolbar}
        </div>
      ) : null}

      {/* NO `key` here. Keying this wrapper remounts <DayPicker>, which owns
          the displayed month internally — see replayEnterAnimation above. */}
      <div
        ref={gridRef}
        className={cn(
          styles.grid,
          direction === 'next' ? styles.enterNext : styles.enterPrev,
        )}
      >
        <DayPicker
          // headless behavior + our warm skin
          animate={false}
          modifiers={mergedModifiers}
          modifiersClassNames={{
            event: styles.eventDay ?? 'fw-cal-event',
            ...(modifiersClassNames ?? {}),
          }}
          onMonthChange={handleMonthChange}
          components={{
            Chevron: CalendarChevron,
            DayButton: CalendarDayButton,
            ...(components ?? {}),
          }}
          classNames={{
            // ---- root + month scaffolding ----
            root: cn(defaults.root, 'w-fit'),
            months: cn(defaults.months, 'relative flex flex-col gap-4'),
            month: cn(defaults.month, 'space-y-3'),
            month_caption: cn(
              defaults.month_caption,
              'flex h-9 items-center justify-center px-1',
            ),
            caption_label: cn(
              defaults.caption_label,
              // Fraunces voice for the month title — the editorial seasoning.
              'font-fw-display text-[17px] font-medium tracking-[-0.005em] text-text-primary',
            ),
            // ---- nav ----
            nav: cn(
              defaults.nav,
              'absolute inset-x-1 top-0 flex h-9 items-center justify-between',
            ),
            button_previous: cn(
              defaults.button_previous,
              navButtonClasses(),
            ),
            button_next: cn(defaults.button_next, navButtonClasses()),
            // ---- weekday header ----
            weekdays: cn(defaults.weekdays, 'flex'),
            weekday: cn(
              defaults.weekday,
              'flex-1 select-none pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary',
              // size the header column to match the day cell width
              cellWidth(cell),
            ),
            // ---- weeks / days ----
            week: cn(defaults.week, 'mt-1 flex'),
            day: cn(
              defaults.day,
              'group relative p-0 text-center',
              cellWidth(cell),
            ),
            day_button: cn(
              defaults.day_button,
              // the actual interactive target — pill, warm states
              'mx-auto flex items-center justify-center rounded-full',
              cell,
              'font-fw-mono tabular-nums leading-none text-text-primary',
              'transition-colors duration-150 ease-out',
              'hover:bg-surface-sunken hover:text-text-primary',
              'active:translate-y-[0.5px]',
              'aria-disabled:pointer-events-none aria-disabled:opacity-40',
            ),
            // ---- day flags ----
            today: cn(
              defaults.today,
              // ringed, not filled, so it never competes with selection
              '[&>button]:font-semibold [&>button]:text-accent-600 [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-accent-300',
            ),
            outside: cn(
              defaults.outside,
              // No opacity stack. text-text-tertiary was deliberately darkened
              // (P422) to clear 4.5:1 on every warm surface; multiplying it by
              // 0.6 threw that away and put out-of-month days — which are still
              // clickable — at ~2.3:1 (audit P-26 / M9).
              '[&>button]:text-text-tertiary',
            ),
            disabled: cn(defaults.disabled, '[&>button]:opacity-40'),
            hidden: cn(defaults.hidden, 'invisible'),
            // ---- selection states ----
            selected: cn(
              defaults.selected,
              '[&>button]:bg-accent-650 [&>button]:text-text-on-accent [&>button]:shadow-soft',
              '[&>button]:hover:bg-accent-600 [&>button]:hover:text-text-on-accent',
            ),
            range_start: cn(defaults.range_start, styles.rangeStart),
            range_middle: cn(
              defaults.range_middle,
              styles.rangeMiddle,
              // middle days keep readable text on the cream track (not filled)
              '[&>button]:bg-transparent [&>button]:text-accent-700 [&>button]:shadow-none [&>button]:hover:bg-accent-100',
            ),
            range_end: cn(defaults.range_end, styles.rangeEnd),
            // ---- week numbers + footer + dropdowns ----
            week_number_header: cn(
              defaults.week_number_header,
              'text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary',
            ),
            week_number: cn(
              defaults.week_number,
              'text-[12px] font-fw-mono tabular-nums text-text-tertiary',
            ),
            footer: cn(
              defaults.footer,
              'pt-3 text-center text-[12px] text-text-secondary',
            ),
            dropdowns: cn(defaults.dropdowns, 'flex items-center gap-2'),
            dropdown_root: cn(defaults.dropdown_root, 'relative'),
            dropdown: cn(
              defaults.dropdown,
              'rounded-fw-sm border border-border-subtle bg-surface px-2 py-1 text-[14px] text-text-primary',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
            ),
            ...(classNames ?? {}),
          }}
          // OPEN ON THE SELECTED DATE'S MONTH, NOT TODAY'S.
          //
          // react-day-picker resolves its initial month as
          // `month || defaultMonth || today` and never looks at `selected`
          // (10.0.1, helpers/getInitialMonth.js). CalendarSurface passed
          // neither, so a picker opened on an event in any other month showed
          // TODAY, with the selected day off-screen — a coach editing an
          // August event on 1 September opens the Start-date field and is
          // looking at September.
          //
          // This was invisible for as long as "today" and the selected date
          // shared a month, which is why two month-navigation suites passed
          // every day until the month rolled over and eight of their
          // assertions failed at once. The tests were right; the component
          // was wrong.
          //
          // Placed BEFORE the spread so an explicit month/defaultMonth from
          // the caller still wins.
          defaultMonth={seedMonth()}
          {...dayPickerProps}
        />
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Local helpers                                                              */
/* -------------------------------------------------------------------------- */
/** The nav prev/next button — pill icon button, full interactive-state set. */
function navButtonClasses(): string {
  return cn(
    'inline-flex h-9 w-9 items-center justify-center rounded-full',
    'text-text-secondary',
    'transition-colors duration-150 ease-out',
    'hover:bg-surface-sunken hover:text-text-primary',
    'active:translate-y-[0.5px]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
    'disabled:pointer-events-none disabled:opacity-40',
  );
}

/** Map the day-button size to the column width so header/cells line up. */
function cellWidth(cell: string): string {
  if (cell.startsWith('h-9')) return 'w-9';
  if (cell.startsWith('h-11')) return 'w-11';
  return 'w-10';
}
