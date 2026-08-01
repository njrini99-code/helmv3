/**
 * ============================================================================
 * Fairway · calendar — public barrel (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * The warm-premium calendar primitive group, built on react-day-picker v10:
 *
 *   • CalendarSurface — warm-styled month grid (today / selected / range
 *     states, event dots, keyboard nav, locale, temporal-direction motion).
 *     Matte by default; opt into the restrained Liquid Glass with `glass`.
 *   • DatePicker — anchored-popover date field (single / multiple / range),
 *     glass panel, localizable trigger label, segment-friendly form props.
 *
 * Import from `@/components/fairway/calendar`.
 * ========================================================================== */

export { CalendarSurface } from './calendar-surface';
export { DatePicker } from './date-picker';

export type {
  CalendarSurfaceProps,
  CalendarSurfaceBaseProps,
  CalendarMode,
  CalendarSize,
  TemporalDirection,
  DateRange,
  Matcher,
  Modifiers,
} from './types';

export type { DatePickerProps } from './date-picker';
