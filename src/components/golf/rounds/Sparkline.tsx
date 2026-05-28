'use client';

/**
 * Sparkline — SVG mini-chart for showing a series of scores in a row.
 *
 * Used in PeriodHeader (above each month/week of rounds) to give an
 * editorial trend cue at a glance — like the volume bars under an
 * article in The Atlantic, or the sparkline beneath a stat in Apple
 * Health.
 *
 * The path animates a stroke-dasharray draw from 0 → full length over
 * 700ms when it scrolls into view, then settles. Reduced-motion users
 * get the static path.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  /** Series of scores. Lower is better in golf, so the line inverts. */
  values: number[];
  /** Stroke color token. Default warm-500. */
  stroke?: string;
  /** Optional fill under the line (uses currentColor with low alpha). */
  filled?: boolean;
  /** Width in px. Default 120. Height stays 24. */
  width?: number;
  height?: number;
  className?: string;
  /** Aria-label for screen readers. */
  label?: string;
}

export function Sparkline({
  values,
  stroke = 'var(--color-primary-600)', // primary-600
  filled = false,
  width = 120,
  height = 24,
  className,
  label,
}: SparklineProps) {
  const [revealed, setRevealed] = React.useState(false);
  const ref = React.useRef<SVGSVGElement>(null);

  // Trigger draw animation when the sparkline scrolls into view.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setRevealed(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padX = 2;
  const padY = 2;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  // For golf, lower scores are better — invert so a downward line is
  // bad and an upward line is good. Actually, we want the line to read
  // intuitively: lower score = lower point on the chart, so we keep
  // the natural mapping and let the eye read it like a stock chart
  // where "down" is "better" in golf. The eyebrow nearby clarifies
  // "Avg 73.6" so context wins.
  const points = values.map((v, i) => {
    const x = padX + (usableW * i) / Math.max(1, values.length - 1);
    const y = padY + usableH * ((v - min) / range);
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(' ');

  const fillPath =
    filled
      ? `${path} L ${padX + usableW} ${padY + usableH} L ${padX} ${padY + usableH} Z`
      : null;

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={label ?? `Trend line of ${values.length} scores`}
    >
      {fillPath && (
        <path
          d={fillPath}
          fill={stroke}
          fillOpacity={revealed ? 0.12 : 0}
          style={{ transition: 'fill-opacity 600ms ease-out 200ms' }}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={revealed ? 0 : 1}
        style={{
          transition: 'stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
      {/* End-cap dot — subtle marker on the latest value */}
      {revealed && points.length > 0 && (() => {
        const last = points[points.length - 1]!;
        return (
          <circle
            cx={last[0]}
            cy={last[1]}
            r={2.25}
            fill={stroke}
            opacity={0.95}
          />
        );
      })()}
    </svg>
  );
}
