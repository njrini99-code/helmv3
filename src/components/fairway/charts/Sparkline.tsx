'use client';

/**
 * ============================================================================
 * Sparkline — inline 64×20 micro-trend (§5.4 shared viz vocabulary)
 * ----------------------------------------------------------------------------
 * A hand-rolled SVG polyline (no axes, no tooltip, no Recharts overhead) sized
 * for inline use inside StatTile / MetricCard / a Leaderboard row. It DRAWS ON
 * ONCE when scrolled into view (strokeDasharray reveal, ~720ms ease-out), then
 * never re-animates (DESIGN-SYSTEM §5.3). Reduced-motion paints it instantly.
 *
 * THE HONESTY CONTRACT:
 *   • <2 finite points → an HONEST em-dash ("—"), NEVER a fake flat line. A
 *     single dot or a straight segment would imply a trend the data can't back.
 *   • Color is goodDirection-AWARE via the cluster's ONE shared classifier
 *     (classifyTrend) — green when the series is improving, warm AMBER (never
 *     red) when declining, recessive neutral when flat. Golf is lower-is-better,
 *     so the caller declares `goodDirection`.
 *   • Color is never the ONLY channel: the chart carries an sr-only verbal
 *     trend summary; consumers pair it with a TrendChip/value for sighted users.
 * ========================================================================== */

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  classifyTrend,
  TREND_COLOR,
  type GoodDirection,
  type TrendDirection,
} from './TrendChip';
import { VIZ_EASE, VIZ_REVEAL_MS } from './theme';

export interface SparklineProps {
  /** The series, oldest → newest. Non-finite entries are dropped. */
  data: ReadonlyArray<number>;
  /** Which direction of the value is GOOD (golf = lower-is-better → 'down'). */
  goodDirection?: GoodDirection;
  /**
   * Deadzone (in value units) for the first→last delta below which the trend
   * reads as `flat`. Defaults to `0`.
   */
  flatThreshold?: number;
  /** Plot width in px. Default 64 (the §5.4 micro size). */
  width?: number;
  /** Plot height in px. Default 20. */
  height?: number;
  /** Stroke weight. Default 1.5. */
  strokeWidth?: number;
  /** Force a trend color override (else derived from the shared classifier). */
  direction?: TrendDirection;
  /** Accessible name prefix, e.g. "Scoring average". Builds the sr summary. */
  label?: string;
  /** Show a small dot on the final (latest) point. Default true. */
  showEndDot?: boolean;
  className?: string;
}

const EM_DASH = '—';

/** Map a finite series to SVG points within the padded plot box. */
function toPoints(
  values: number[],
  width: number,
  height: number,
  pad: number,
): string {
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;

  return values
    .map((v, i) => {
      const x = pad + i * stepX;
      // flat series → center vertically (avoids a divide-by-zero baseline)
      const norm = span === 0 ? 0.5 : (v - min) / span;
      // SVG y grows downward; higher value sits higher on screen
      const y = pad + (1 - norm) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/**
 * The inline micro-trend. Composes the shared trend classifier for its color
 * and draws on once-in-view. Honest em-dash when the series can't sustain a
 * trend (<2 finite points).
 */
export const Sparkline = React.forwardRef<HTMLSpanElement, SparklineProps>(function Sparkline(
  {
    data,
    goodDirection = 'up',
    flatThreshold = 0,
    width = 64,
    height = 20,
    strokeWidth = 1.5,
    direction,
    label,
    showEndDot = true,
    className,
  },
  ref,
) {
  const reduced = useReducedMotion() ?? false;
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  // Draw on ONCE the first time it enters the viewport (not every re-render).
  const inView = useInView(wrapRef, { once: true, amount: 0.6 });

  // Honest filtering: only finite numbers count toward "enough points".
  const values = React.useMemo(
    () => data.filter((v): v is number => Number.isFinite(v)),
    [data],
  );

  // HONESTY CONTRACT — <2 points renders an em-dash, never a fake flat line.
  if (values.length < 2) {
    return (
      <span
        ref={ref}
        data-slot="sparkline"
        data-state="insufficient-data"
        aria-label={label ? `${label}: not enough data` : 'Not enough data'}
        className={cn(
          'inline-flex items-center justify-center font-fw-mono text-text-tertiary',
          className,
        )}
        style={{ width, height }}
      >
        <span aria-hidden="true">{EM_DASH}</span>
      </span>
    );
  }

  const pad = Math.max(1, strokeWidth);
  const points = toPoints(values, width, height, pad);

  // `values.length >= 2` is guaranteed above, so first/last are present.
  const first = values[0] as number;
  const last = values[values.length - 1] as number;

  const verdict: TrendDirection =
    direction ?? classifyTrend(last - first, { goodDirection, flatThreshold });
  const color = TREND_COLOR[verdict];

  const lastPoint = points.split(' ').slice(-1)[0] ?? '0,0';
  const [lastX = 0, lastY = 0] = lastPoint.split(',').map(Number);

  // Finding #2/#6 (AUDIT-0724): when a caller hands in a pre-computed
  // `direction` (e.g. from the shared `computeSeriesTrend()`, which classifies
  // a SPLIT-HALF AVERAGE, not an endpoint diff), the old "from {first} to
  // {last}" framing could read as self-contradictory to a screen reader — a
  // "declining" verdict paired with "from 61 to 61" when the endpoints
  // happen to match even though the recent half really did fall. Drop the
  // endpoint clause in that case rather than narrate a delta this verdict
  // wasn't computed from; the internal endpoint-diff fallback (no `direction`
  // supplied) still narrates its own true first→last move.
  const summary =
    `${label ? `${label}: ` : ''}` +
    (direction != null
      ? `${verdict} trend over ${values.length} points.`
      : `${verdict} over ${values.length} points, from ${first} to ${last}.`);

  return (
    <span
      ref={(node) => {
        wrapRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLSpanElement | null>).current = node;
      }}
      data-slot="sparkline"
      data-direction={verdict}
      role="img"
      aria-label={summary}
      className={cn('inline-block align-middle', className)}
      style={{ width, height }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        aria-hidden="true"
        className="overflow-visible"
      >
        <motion.polyline
          points={points}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          // strokeDasharray draw-on reveal, once-in-view; reduced-motion = instant
          initial={reduced ? false : { pathLength: 0, opacity: 0.4 }}
          animate={
            reduced
              ? { pathLength: 1, opacity: 1 }
              : inView
                ? { pathLength: 1, opacity: 1 }
                : { pathLength: 0, opacity: 0.4 }
          }
          transition={
            reduced
              ? { duration: 0 }
              : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE }
          }
        />
        {showEndDot ? (
          <motion.circle
            cx={lastX}
            cy={lastY}
            r={strokeWidth + 0.5}
            fill={color}
            initial={reduced ? false : { opacity: 0, scale: 0.4 }}
            animate={
              reduced || inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }
            }
            transition={
              reduced
                ? { duration: 0 }
                : { duration: 0.24, ease: VIZ_EASE, delay: VIZ_REVEAL_MS / 1000 }
            }
          />
        ) : null}
      </svg>
    </span>
  );
});
