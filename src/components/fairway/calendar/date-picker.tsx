'use client';

/**
 * ============================================================================
 * Fairway · calendar · DatePicker (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * The anchored-popover date field built on the headless Radix Popover (focus
 * trap, scroll-lock, Escape, outside-click, ARIA) + the warm CalendarSurface.
 *
 *   • Trigger is a warm matte field with the locked interactive-state contract
 *     (hover tint, green focus-visible ring that survives cream, active press).
 *   • Popover panel is the RESTRAINED Liquid Glass material — allow-listed
 *     because an overlay is, by definition, the floating layer (§4.3). It
 *     collapses to an opaque matte surface under reduced-transparency.
 *   • Single / multiple / range modes (react-day-picker selection types flow
 *     through). Localizable: pass `locale` (date-fns), `dir`, `weekStartsOn`,
 *     a custom trigger `format` / `placeholder`.
 *   • Controlled or uncontrolled `open`; `onSelect` closes on single-pick.
 *   • Segment-friendly: `id` / `name` / `aria-label` / `disabled` pass through
 *     so it drops into a FormField row.
 *
 * Self-contained: uses @radix-ui/react-popover directly (does NOT import the
 * app's ui/popover wrapper) so the group owns its own behavior + styling.
 * ========================================================================== */

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { format as formatDate, type Locale } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarSurface } from './calendar-surface';
import glass from '../surfaces/glass-surface.module.css';
import type { CalendarMode, CalendarSize, DateRange } from './types';

/* -------------------------------------------------------------------------- */
/* Value typing per mode                                                       */
/* -------------------------------------------------------------------------- */
type ValueForMode<M extends CalendarMode> = M extends 'single'
  ? Date | undefined
  : M extends 'multiple'
    ? Date[] | undefined
    : DateRange | undefined;

interface DatePickerBaseProps<M extends CalendarMode> {
  /** Selection mode. Default `single`. */
  mode?: M;
  /** Controlled selected value. */
  value?: ValueForMode<M>;
  /** Default selected value (uncontrolled). */
  defaultValue?: ValueForMode<M>;
  /** Selection change handler. Fires with the new value. */
  onValueChange?: (value: ValueForMode<M>) => void;

  /** Controlled open state of the popover. */
  open?: boolean;
  /** Default open state (uncontrolled). */
  defaultOpen?: boolean;
  /** Open-state change handler. */
  onOpenChange?: (open: boolean) => void;

  /** Disable the whole field. */
  disabled?: boolean;
  /** Placeholder shown when nothing is selected. Default "Pick a date". */
  placeholder?: string;
  /** Day grid sizing inside the popover. Default `cozy`. */
  size?: CalendarSize;

  /** Locale for both the calendar and the trigger label (date-fns Locale). */
  locale?: Locale;
  /**
   * date-fns format string for the trigger label of a single date.
   * Default "PPP" (e.g. "May 29th, 2026") — locale-aware.
   */
  format?: string;
  /**
   * Custom renderer for the trigger label, overriding the default formatting.
   * Receives the current value; return any node.
   */
  renderLabel?: (value: ValueForMode<M>) => React.ReactNode;

  /** Popover side. Default "bottom". */
  side?: PopoverPrimitive.PopoverContentProps['side'];
  /** Popover alignment. Default "start". */
  align?: PopoverPrimitive.PopoverContentProps['align'];

  /** id forwarded to the trigger (FormField association). */
  id?: string;
  /** name forwarded for native form participation (hidden input). */
  name?: string;
  /** aria-label for the trigger when there's no visible label. */
  'aria-label'?: string;
  /** Class for the trigger button. Merged last-wins via cn(). */
  className?: string;
  /** Class for the popover panel. */
  contentClassName?: string;

  /** react-day-picker passthrough: disable matching days. */
  disabledDays?: React.ComponentProps<typeof CalendarSurface>['disabled'];
  /** react-day-picker passthrough: event-dot days. */
  eventDays?: React.ComponentProps<typeof CalendarSurface>['eventDays'];
  /** First day of week override. */
  weekStartsOn?: React.ComponentProps<typeof CalendarSurface>['weekStartsOn'];
  /** Text direction (rtl localization). */
  dir?: React.ComponentProps<typeof CalendarSurface>['dir'];
  /** Number of months to show in the panel. Default 1. */
  numberOfMonths?: number;
}

export type DatePickerProps<M extends CalendarMode = 'single'> =
  DatePickerBaseProps<M>;

/* -------------------------------------------------------------------------- */
/* Label formatting                                                            */
/* -------------------------------------------------------------------------- */
function defaultLabel(
  mode: CalendarMode,
  value: unknown,
  fmt: string,
  locale: Locale | undefined,
): string | null {
  const opts = locale ? { locale } : undefined;
  if (mode === 'single') {
    return value instanceof Date ? formatDate(value, fmt, opts) : null;
  }
  if (mode === 'multiple') {
    const arr = value as Date[] | undefined;
    if (!arr || arr.length === 0) return null;
    if (arr.length === 1 && arr[0]) return formatDate(arr[0], fmt, opts);
    return `${arr.length} dates`;
  }
  // range
  const range = value as DateRange | undefined;
  if (!range?.from) return null;
  const from = formatDate(range.from, fmt, opts);
  return range.to ? `${from} – ${formatDate(range.to, fmt, opts)}` : from;
}

/* -------------------------------------------------------------------------- */
/* Native form value (hidden input) for `name`                                */
/* -------------------------------------------------------------------------- */
function toFormValue(mode: CalendarMode, value: unknown): string {
  const iso = (d: Date) => formatDate(d, 'yyyy-MM-dd');
  if (mode === 'single') return value instanceof Date ? iso(value) : '';
  if (mode === 'multiple')
    return Array.isArray(value) ? value.map(iso).join(',') : '';
  const range = value as DateRange | undefined;
  if (!range?.from) return '';
  return range.to ? `${iso(range.from)}/${iso(range.to)}` : iso(range.from);
}

/* -------------------------------------------------------------------------- */
/* DatePicker                                                                  */
/* -------------------------------------------------------------------------- */
function DatePickerInner<M extends CalendarMode = 'single'>(
  props: DatePickerProps<M>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const {
    mode = 'single' as M,
    value: valueProp,
    defaultValue,
    onValueChange,
    open: openProp,
    defaultOpen,
    onOpenChange,
    disabled,
    placeholder = 'Pick a date',
    size = 'cozy',
    locale,
    format: fmt = 'PPP',
    renderLabel,
    side = 'bottom',
    align = 'start',
    id,
    name,
    'aria-label': ariaLabel,
    className,
    contentClassName,
    disabledDays,
    eventDays,
    weekStartsOn,
    dir,
    numberOfMonths = 1,
  } = props;

  // Controlled / uncontrolled value.
  const [valueState, setValueState] = React.useState<ValueForMode<M> | undefined>(
    defaultValue,
  );
  const value = (valueProp !== undefined ? valueProp : valueState) as
    | ValueForMode<M>
    | undefined;

  // Controlled / uncontrolled open.
  const [openState, setOpenState] = React.useState(defaultOpen ?? false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );

  const commit = React.useCallback(
    (next: ValueForMode<M> | undefined) => {
      if (valueProp === undefined) setValueState(next);
      onValueChange?.(next as ValueForMode<M>);
      // Auto-close once a single date is fully chosen.
      if (mode === 'single' && next instanceof Date) setOpen(false);
    },
    [valueProp, onValueChange, mode, setOpen],
  );

  const label =
    renderLabel?.(value as ValueForMode<M>) ??
    defaultLabel(mode, value, fmt, locale);
  const hasValue = label != null && label !== '';

  // react-day-picker's selection props are a per-mode discriminated union; the
  // public typing above is sound, so we build the mode-specific block once and
  // assert at the single boundary where TS can't follow the generic narrowing.
  const selectionProps = {
    mode,
    selected: value,
    onSelect: commit,
    disabled: disabledDays,
    eventDays,
    weekStartsOn,
    dir,
    locale,
    numberOfMonths,
    size,
    glass: true,
    autoFocus: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        ref={ref}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? (hasValue ? undefined : placeholder)}
        data-slot="date-picker-trigger"
        data-empty={hasValue ? undefined : ''}
        className={cn(
          'group inline-flex min-h-[40px] w-full items-center gap-2 rounded-fw-sm px-3 py-2',
          'border border-border-subtle bg-surface text-left font-fw-sans text-body',
          hasValue ? 'text-text-primary' : 'text-text-tertiary',
          'transition-colors duration-150 ease-out',
          'hover:bg-surface-sunken',
          'data-[state=open]:border-border-focus data-[state=open]:bg-surface',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
          'active:translate-y-[0.5px]',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
      >
        <CalendarIcon
          className="h-4 w-4 shrink-0 text-text-tertiary"
          aria-hidden="true"
        />
        <span className="flex-1 truncate">{hasValue ? label : placeholder}</span>
      </PopoverPrimitive.Trigger>

      {name ? (
        // Native hidden value carrier for form participation — not a visible
        // control, so the app's styled <Input> does not apply (and this group
        // imports no external components).
        // eslint-disable-next-line helm/no-raw-input
        <input type="hidden" name={name} value={toFormValue(mode, value)} />
      ) : null}

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          data-slot="date-picker-panel"
          className={cn(
            // RESTRAINED Liquid Glass (allow-listed overlay) — collapses to
            // matte under reduced-transparency via the shared glass module.
            glass.glass,
            'z-modal rounded-lg p-1 outline-none',
            // cinematic materialize: opacity + scale + slight directional drift
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
            'duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            contentClassName,
          )}
        >
          <CalendarSurface {...selectionProps} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * The generic forwardRef cast preserves the per-mode `value` / `onValueChange`
 * typing for callers while still forwarding the ref to the trigger button.
 */
export const DatePicker = React.forwardRef(DatePickerInner) as <
  M extends CalendarMode = 'single',
>(
  props: DatePickerProps<M> & { ref?: React.ForwardedRef<HTMLButtonElement> },
) => React.ReactElement;

export default DatePicker;
