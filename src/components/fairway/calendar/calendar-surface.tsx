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
  // Bump a key on each month change to re-trigger the entrance animation.
  const [animKey, setAnimKey] = React.useState(0);

  const handleMonthChange = React.useCallback(
    (month: Date) => {
      const prev = prevMonthRef.current;
      if (prev) {
        setDirection(month.getTime() >= prev.getTime() ? 'next' : 'prev');
      }
      prevMonthRef.current = month;
      setAnimKey((k) => k + 1);
      onMonthChange?.(month);
    },
    [onMonthChange],
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

      <div
        key={animKey}
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
              '[&>button]:text-text-tertiary [&>button]:opacity-60',
            ),
            disabled: cn(defaults.disabled, '[&>button]:opacity-40'),
            hidden: cn(defaults.hidden, 'invisible'),
            // ---- selection states ----
            selected: cn(
              defaults.selected,
              '[&>button]:bg-accent-500 [&>button]:text-text-on-accent [&>button]:shadow-soft',
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

export default CalendarSurface;
