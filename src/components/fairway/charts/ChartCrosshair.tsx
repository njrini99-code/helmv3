'use client';

/**
 * ============================================================================
 * ChartCrosshair — the keyboard + a11y path for every line/area chart (§5.4)
 * ----------------------------------------------------------------------------
 * Pairs with the existing ChartTooltip to make a Recharts line/area chart
 * fully keyboard-drivable AND screen-reader announceable — the a11y channel the
 * blueprint mandates for "every line/area chart" (DESIGN-SYSTEM §7.4: "keyboard
 * crosshair moves through points announcing values (live region)").
 *
 * THREE cooperating pieces, all token-driven (no raw hex):
 *
 *   1. useChartCrosshair() — headless controller. Owns `activeIndex`, the
 *      roving keyboard handlers (← / → step, Home / End jump, Esc clears) and
 *      the `aria-live` announcement string. Reduced-motion is irrelevant to the
 *      INDEX (it snaps regardless); it only affects the optional hairline tween.
 *   2. <ChartCrosshairCursor> — a Recharts custom `cursor` (a calm hairline
 *      ReferenceLine analogue drawn in the plot's coordinate space) + the
 *      focused-point ring. Drop into <Tooltip cursor={…}> or render directly.
 *   3. <ChartCrosshairLiveRegion> — the visually-hidden polite live region that
 *      announces the focused point. ONE per chart; never a second SR channel.
 *
 * The wrapper element returned by the hook is `tabIndex=0`, `role="application"`
 * with an `aria-label`, so the chart is a single focusable widget whose arrow
 * keys traverse the series (the matte SVG itself stays aria-hidden, per
 * ChartFrame's role="img" contract).
 * ========================================================================== */

import * as React from 'react';
import { VIZ_CHROME, VIZ_COLOR } from './theme';

/* -------------------------------------------------------------------------- */
/* Headless controller                                                         */
/* -------------------------------------------------------------------------- */

export interface CrosshairPoint {
  /** x label (date / round / category) used in the announcement. */
  label: string | number;
  /** y value used in the announcement (pre-formatted via `formatValue`). */
  value: number;
}

export interface UseChartCrosshairOptions {
  /** The ordered series the crosshair traverses (same order as the chart). */
  points: ReadonlyArray<CrosshairPoint>;
  /** Format a value for the spoken announcement (defaults to String). */
  formatValue?: (value: number) => string;
  /** Series name spoken in the announcement, e.g. "Scoring average". */
  seriesName?: string;
  /** Called whenever the active index changes (sync external tooltip state). */
  onActiveIndexChange?: (index: number | null) => void;
}

export interface UseChartCrosshair {
  /** The focused point index, or null when nothing is focused. */
  activeIndex: number | null;
  /** Imperatively set the active index (clamped; null clears). */
  setActiveIndex: (index: number | null) => void;
  /** The current spoken announcement (feed to the live region). */
  announcement: string;
  /**
   * Spread onto the focusable chart wrapper. Provides role/tabIndex/aria-label
   * + the roving key handlers (← → Home End Esc) + blur-clears-focus.
   */
  containerProps: {
    role: 'application';
    tabIndex: 0;
    'aria-label': string;
    'aria-roledescription': string;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onBlur: () => void;
  };
}

/**
 * The headless crosshair controller. Owns the focused index + keyboard
 * traversal + the live-region string. No DOM beyond the key handlers — the
 * cursor visuals + live region are rendered by the components below.
 */
export function useChartCrosshair({
  points,
  formatValue = (v) => String(v),
  seriesName = 'Series',
  onActiveIndexChange,
}: UseChartCrosshairOptions): UseChartCrosshair {
  const [activeIndex, setActiveIndexState] = React.useState<number | null>(null);
  const count = points.length;

  const setActiveIndex = React.useCallback(
    (index: number | null) => {
      let next: number | null;
      if (index === null || count === 0) {
        next = null;
      } else {
        next = Math.max(0, Math.min(index, count - 1));
      }
      setActiveIndexState(next);
      onActiveIndexChange?.(next);
    },
    [count, onActiveIndexChange],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (count === 0) return;
      const cur = activeIndex;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(cur === null ? 0 : cur + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(cur === null ? count - 1 : cur - 1);
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(count - 1);
          break;
        case 'Escape':
          if (cur !== null) {
            e.preventDefault();
            setActiveIndex(null);
          }
          break;
        default:
          break;
      }
    },
    [activeIndex, count, setActiveIndex],
  );

  const onBlur = React.useCallback(() => setActiveIndex(null), [setActiveIndex]);

  const announcement = React.useMemo(() => {
    if (activeIndex === null || !points[activeIndex]) return '';
    const p = points[activeIndex];
    // e.g. "Scoring average. Round 5: 71.2. Point 5 of 12."
    return `${seriesName}. ${p.label}: ${formatValue(p.value)}. Point ${activeIndex + 1} of ${count}.`;
  }, [activeIndex, points, seriesName, formatValue, count]);

  return {
    activeIndex,
    setActiveIndex,
    announcement,
    containerProps: {
      role: 'application',
      tabIndex: 0,
      'aria-label': `${seriesName} chart. Use arrow keys to read values, Home and End to jump, Escape to clear.`,
      'aria-roledescription': 'interactive chart',
      onKeyDown,
      onBlur,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Recharts custom cursor                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The slice of Recharts' `cursor` render-prop payload we read. Declared locally
 * (Recharts' cursor prop types churn across minors) so this drops into
 * `<Tooltip cursor={…}>` or `<Tooltip cursor={<ChartCrosshairCursor … />}>`.
 */
export interface ChartCrosshairCursorProps {
  /** Plot box (handed by Recharts). */
  points?: Array<{ x: number; y: number }>;
  width?: number;
  height?: number;
  top?: number;
  left?: number;
  /** When true (reduced-motion off), the hairline may tween; default snaps. */
  animated?: boolean;
}

/**
 * A calm vertical hairline + a soft focused-point ring, drawn in the plot's
 * coordinate space using the warm chart-chrome tokens. Pair with Recharts'
 * `<Tooltip cursor={<ChartCrosshairCursor />}>` so pointer hover AND keyboard
 * focus share one cursor visual. Honors reduced-motion (snaps; no tween).
 */
export function ChartCrosshairCursor({
  points,
  height,
  top,
}: ChartCrosshairCursorProps) {
  const head = points?.[0];
  if (!head) return null;
  const { x, y } = head;
  const y0 = typeof top === 'number' ? top : 0;
  const y1 = typeof height === 'number' ? y0 + height : y;

  return (
    <g aria-hidden="true" data-slot="chart-crosshair-cursor">
      <line
        x1={x}
        x2={x}
        y1={y0}
        y2={y1}
        stroke={VIZ_CHROME.benchmark}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      {/* focused-point ring: a small ≤1.5px-grow accent halo (§5.3 micro-motion) */}
      <circle cx={x} cy={y} r={4} fill={VIZ_COLOR.surface} stroke={VIZ_COLOR.accent} strokeWidth={2} />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Live region                                                                 */
/* -------------------------------------------------------------------------- */

export interface ChartCrosshairLiveRegionProps {
  /** The announcement string from useChartCrosshair (re-spoken on change). */
  announcement: string;
  className?: string;
}

/**
 * The single visually-hidden polite live region that announces the focused
 * point. ONE per chart — it is the SR readout for the crosshair, complementing
 * (never duplicating) ChartFrame's "view as table" fallback.
 */
export function ChartCrosshairLiveRegion({
  announcement,
  className,
}: ChartCrosshairLiveRegionProps) {
  return (
    <span
      data-slot="chart-crosshair-live"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={className ?? 'sr-only'}
    >
      {announcement}
    </span>
  );
}
