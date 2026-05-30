/**
 * ============================================================================
 * Fairway · calendar · shared types (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * Local types for the Fairway calendar primitive group (CalendarSurface +
 * DatePicker), built on react-day-picker v10. Self-contained so the group
 * never reaches for a top-level shared file other agents might also touch.
 *
 * We re-export the react-day-picker types a consumer needs (DateRange,
 * Matcher, the per-mode prop unions) so callers can import everything from
 * `@/components/fairway/calendar` without also depending on react-day-picker
 * directly. The temporal-direction + localization story lives here too.
 * ========================================================================== */

import type {
  DateRange,
  Matcher,
  Modifiers,
  DayPickerProps,
  PropsBase,
} from 'react-day-picker';
import type { ReactNode } from 'react';

/** Selection modes mirrored from react-day-picker. */
export type CalendarMode = 'single' | 'multiple' | 'range';

/**
 * Direction of travel between months. Drives the slide/fade of the month grid
 * so motion reflects time — "next" enters from the right (the future), "prev"
 * enters from the left (the past). Honors `prefers-reduced-motion`.
 */
export type TemporalDirection = 'next' | 'prev';

/**
 * Visual sizing of the day grid. Affects cell size + tap targets only — every
 * size keeps cells >= 24px CSS (WCAG 2.2 target minimum); `comfortable` reaches
 * the 40px pill the design system prefers for primary touch controls.
 */
export type CalendarSize = 'compact' | 'cozy' | 'comfortable';

/**
 * The base prop set shared by CalendarSurface across every selection mode.
 * Extends react-day-picker's PropsBase but narrows / documents the props the
 * Fairway surface adds on top. Mode-specific selection props (`selected`,
 * `onSelect`, `min`, `max`, `required`) flow through the discriminated union in
 * `CalendarSurfaceProps` below, exactly as react-day-picker types them.
 */
export interface CalendarSurfaceBaseProps
  extends Omit<PropsBase, 'mode' | 'required' | 'classNames' | 'components'> {
  /** Visual sizing of the grid. Default `cozy`. */
  size?: CalendarSize;
  /**
   * Render an event-count dot under days matching this matcher (or a custom
   * `eventDays` map). Quiet accent dot — segment-friendly for month overviews.
   */
  eventDays?: Matcher | Matcher[];
  /**
   * Slot rendered above the grid (inside the surface), e.g. a "Today" quick
   * button or a range summary. Sits on the matte surface, not glass.
   */
  toolbar?: ReactNode;
  /**
   * Extra react-day-picker `classNames` overrides, deep-merged AFTER the
   * Fairway warm defaults so callers can tweak a single slot without losing
   * the rest of the styling.
   */
  classNames?: Partial<Record<string, string>>;
  /**
   * When `true`, the surface paints the RESTRAINED Liquid Glass material
   * instead of the matte default. Reserved for the allow-listed floating
   * contexts (e.g. inside the DatePicker popover) — never a resting card.
   * Default `false` (matte).
   */
  glass?: boolean;
  /** Class applied to the outer surface wrapper. Merged last-wins via cn(). */
  className?: string;
}

/**
 * Full CalendarSurface props: the Fairway base props intersected with
 * react-day-picker's mode-discriminated selection union. This preserves
 * react-day-picker's exact `selected` / `onSelect` typing per mode.
 */
export type CalendarSurfaceProps = CalendarSurfaceBaseProps &
  Extract<DayPickerProps, { mode?: CalendarMode | undefined }>;

export type { DateRange, Matcher, Modifiers };
