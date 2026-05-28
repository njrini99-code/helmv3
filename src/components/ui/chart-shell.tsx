'use client';

/**
 * ChartShell — the canonical surface + chrome wrapper for every data-viz
 * panel (Wave W5A — ultra-audit MASTER synthesis A4 / A2: one chart surface,
 * not the ~30 hand-rolled `<Card>+header+legend` chart wrappers scattered
 * across admin + coachhelm + player-hub).
 *
 * Composition:
 *
 *   <ChartShell
 *     title="Strokes Gained"
 *     subtitle="Last 12 rounds vs PGA Tour baseline"
 *     legend={<ChartLegend items={…} />}
 *     actions={<RangeToggle … />}
 *     mobileVariant="bars"
 *   >
 *     <ResponsiveContainer>…</ResponsiveContainer>
 *   </ChartShell>
 *
 * Surface (look-preserving with the canonical matte card): a 16px-radius
 * cream-elevated panel with a hairline subtle border and the `sm` elevation
 * shadow, padded p-5 md:p-6. Entrance uses the v3 `enterVariants` /
 * `enterTransition` motion grammar (soft rise + fade), so a ChartShell
 * composes into place with the EXACT same speed + easing as every other v3
 * section. Reduced-motion users get an instant render.
 *
 * The header is a single row: title (+ optional subtitle beneath) on the
 * left, then the legend (top-right on desktop) and an actions slot. On mobile
 * the legend pivots to a full-width row beneath the header (see ChartLegend),
 * and the chart body itself can pivot via `mobileVariant`:
 *
 *   - 'shrink'  (default) keep the same chart, just smaller — the body is
 *               rendered as-is and the consumer's ResponsiveContainer reflows.
 *   - 'bars'    a hint that the consumer swaps to a bar representation on
 *               narrow screens — exposed as a data-attribute + render-prop
 *               signal; ChartShell does not transform the chart itself.
 *   - 'summary' collapse the chart to a compact summary on mobile (the
 *               consumer passes `mobileSummary`); the full chart is hidden
 *               below the `sm` breakpoint and the summary shown in its place.
 *   - 'hide'    drop the chart entirely on mobile (kept in the DOM for
 *               desktop, `hidden sm:block`), useful for dense secondary viz.
 *
 * Audit reference: ultra-audit master synthesis A4 (component sprawl) + A2
 * (surface consistency) — one canonical chart surface, no hand-rolled chart
 * cards.
 */

import * as React from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  enterVariants,
  enterTransition,
  stagger,
  useReducedMotion,
} from '@/lib/coachhelm/v3/motion';

export type ChartMobileVariant = 'shrink' | 'bars' | 'summary' | 'hide';

type DivMotionConflicts =
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragEnd'
  | 'onDragStart'
  | 'onDragOver'
  | 'onDragEnter'
  | 'onDragLeave'
  | 'onDragExit'
  | 'onTransitionEnd';

export interface ChartShellProps
  extends Omit<React.HTMLAttributes<HTMLElement>, DivMotionConflicts | 'title'> {
  /** Panel title — rendered as a semantic chart heading. */
  title: React.ReactNode;
  /** Optional one-line caption beneath the title. */
  subtitle?: React.ReactNode;
  /** Legend node (typically <ChartLegend />). Top-right on desktop. */
  legend?: React.ReactNode;
  /** Action controls (range toggles, export, info) — right of the header. */
  actions?: React.ReactNode;
  /**
   * How the chart body should adapt on narrow screens. See module docs.
   * Defaults to 'shrink'.
   */
  mobileVariant?: ChartMobileVariant;
  /**
   * Compact replacement rendered below `sm` when `mobileVariant="summary"`.
   * Ignored for the other variants.
   */
  mobileSummary?: React.ReactNode;
  /**
   * Stagger this ChartShell behind sibling reveals in the same row.
   * Each step adds the canonical 70ms sibling-stagger.
   */
  staggerIndex?: number;
  /** Drop the entrance animation entirely (e.g. inside an already-animated parent). */
  noEntrance?: boolean;
  /** Class applied to the chart body wrapper (the area holding `children`). */
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function ChartShell({
  title,
  subtitle,
  legend,
  actions,
  mobileVariant = 'shrink',
  mobileSummary,
  staggerIndex = 0,
  noEntrance = false,
  className,
  bodyClassName,
  children,
  ...props
}: ChartShellProps) {
  const reduce = useReducedMotion();
  const animate = !noEntrance && !reduce;

  return (
    <m.section
      data-chart-mobile-variant={mobileVariant}
      initial={animate ? 'hidden' : false}
      animate={animate ? 'visible' : false}
      variants={animate ? enterVariants : undefined}
      transition={
        animate ? { ...enterTransition, delay: stagger(staggerIndex) } : undefined
      }
      className={cn(
        // Canonical matte chart surface — cream-elevated panel, hairline
        // subtle border, sm elevation shadow, responsive padding.
        'rounded-xl bg-cream-50 border border-[color:var(--color-border-subtle)] shadow-sm',
        'p-5 md:p-6',
        className,
      )}
      {...props}
    >
      {/* Header: title (+ subtitle) on the left; legend (top-right desktop)
          + actions on the right. On mobile the legend pivots full-width
          beneath this row (handled inside ChartLegend's own responsive CSS),
          so it is rendered here once and reflows. */}
      {(title || subtitle || legend || actions) && (
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h3 className="text-h3 font-semibold text-warm-900 truncate">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-body-sm text-warm-500">{subtitle}</p>
            )}
          </div>
          {(legend || actions) && (
            <div className="flex shrink-0 items-center gap-3 sm:justify-end">
              {legend}
              {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
          )}
        </header>
      )}

      {/* Chart body. The mobile pivot decides whether the body shows below
          the `sm` breakpoint, and whether a compact summary takes its place. */}
      <div
        className={cn(
          'relative',
          mobileVariant === 'hide' && 'hidden sm:block',
          mobileVariant === 'summary' && 'hidden sm:block',
          bodyClassName,
        )}
      >
        {children}
      </div>

      {mobileVariant === 'summary' && mobileSummary != null && (
        <div className="sm:hidden">{mobileSummary}</div>
      )}
    </m.section>
  );
}

ChartShell.displayName = 'ChartShell';
