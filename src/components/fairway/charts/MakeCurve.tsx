'use client';

/**
 * ============================================================================
 * MakeCurve — rate-by-distance curve (e.g. putt make% by distance band)
 * ----------------------------------------------------------------------------
 * A single SVG line + soft accent area fill over a fixed 0-100% y-axis. Each
 * band is a dot whose RADIUS encodes sample size (`n`) — small n reads as a
 * visibly small dot, so thin data is honestly thin rather than pretending
 * every band is equally trustworthy. Bands below the reliability floor
 * (`n < 8`, or `n` unknown) render HOLLOW (outline only, no fill).
 *
 * A `null` pct band breaks the line into a new run (a real gap, never an
 * interpolated fake value) and gets a small ghost tick on the x-axis instead
 * of a dot, so the reader can see exactly which bands have no read yet.
 * ========================================================================== */

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ChartTooltip } from './ChartTooltip';
import { VIZ_CHROME, VIZ_COLOR } from './theme';

export interface MakeCurvePoint {
  label: string;
  pct: number | null;
  n: number | null;
}

export interface MakeCurveProps {
  points: MakeCurvePoint[];
  ariaLabel: string;
}

/* ---------------------------------------------------------------------------
 * Pure helpers — exported for the colocated unit tests.
 * ------------------------------------------------------------------------- */

export const MAKE_CURVE_MIN_RADIUS = 3;
export const MAKE_CURVE_MAX_RADIUS = 7;
export const MAKE_CURVE_SATURATION_N = 40;
export const MAKE_CURVE_SUB_FLOOR_N = 8;

/** n → dot radius, saturating at MAKE_CURVE_SATURATION_N. Unknown/0/negative n → the floor radius. */
export function dotRadiusForN(n: number | null | undefined): number {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return MAKE_CURVE_MIN_RADIUS;
  const t = Math.min(1, n / MAKE_CURVE_SATURATION_N);
  return MAKE_CURVE_MIN_RADIUS + t * (MAKE_CURVE_MAX_RADIUS - MAKE_CURVE_MIN_RADIUS);
}

/** Below the reliability floor (or unknown) → render outline-only, never a confident fill. */
export function isHollowDot(n: number | null | undefined): boolean {
  return n === null || n === undefined || !Number.isFinite(n) || n < MAKE_CURVE_SUB_FLOOR_N;
}

/**
 * Groups point INDICES into contiguous runs of non-null pct — a null pct
 * ends the current run (a real gap), never interpolated across.
 */
export function computeLineRuns(points: ReadonlyArray<{ pct: number | null }>): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const pct = points[i]!.pct;
    if (pct !== null && Number.isFinite(pct)) {
      current.push(i);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/** Evenly-spaced x position for index `i` of `count` across `innerW`. Single point centers. */
export function xForIndex(i: number, count: number, innerW: number): number {
  if (count <= 1) return innerW / 2;
  return (i / (count - 1)) * innerW;
}

/** Fixed 0-100 domain → [innerH, 0] pixel range (100% at the top). */
export function yForPct(pct: number, innerH: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return innerH - (clamped / 100) * innerH;
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

const VIEW_W = 480;
const VIEW_H = 220;
const MARGIN = { top: 14, right: 16, bottom: 26, left: 34 };
const INNER_W = VIEW_W - MARGIN.left - MARGIN.right;
const INNER_H = VIEW_H - MARGIN.top - MARGIN.bottom;
const Y_GRIDLINES = [0, 50, 100];
const ENTRANCE_MS = 380;

export function MakeCurve({ points, ariaLabel }: MakeCurveProps) {
  const reduced = useReducedMotion() ?? false;
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  const runs = React.useMemo(() => computeLineRuns(points), [points]);
  const count = points.length;

  const clearActive = (i: number) => setActiveIndex((cur) => (cur === i ? null : cur));

  if (count === 0) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        style={{ minHeight: VIEW_H }}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border-subtle bg-inset p-6 text-center"
      >
        <span className="font-fw-sans text-body-sm font-medium text-text-secondary">No rate curve yet</span>
        <span className="font-fw-sans text-caption font-normal text-text-tertiary">
          Log enough attempts per band and the make-rate curve fills in here.
        </span>
      </div>
    );
  }

  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeCx = activeIndex !== null ? MARGIN.left + xForIndex(activeIndex, count, INNER_W) : 0;
  const activeCy = active && active.pct !== null ? MARGIN.top + yForPct(active.pct, INNER_H) : 0;

  return (
    <div
      data-slot="make-curve"
      className="relative w-full rounded-card border border-border-subtle bg-surface-sunken p-4 sm:p-5"
    >
      <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={ariaLabel}
          className="block h-full w-full overflow-visible"
        >
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {/* y gridlines + mono labels */}
            {Y_GRIDLINES.map((t) => {
              const y = yForPct(t, INNER_H);
              return (
                <g key={t}>
                  <line x1={0} x2={INNER_W} y1={y} y2={y} stroke={VIZ_CHROME.grid} strokeWidth={1} />
                  <text
                    x={-8}
                    y={y}
                    dy="0.32em"
                    textAnchor="end"
                    className="font-fw-mono text-microbadge tabular-nums"
                    fill={VIZ_COLOR.textTertiary}
                  >
                    {t}%
                  </text>
                </g>
              );
            })}

            {/* x band labels + ghost ticks for null bands */}
            {points.map((p, i) => {
              const x = xForIndex(i, count, INNER_W);
              const isNull = p.pct === null || !Number.isFinite(p.pct);
              return (
                <g key={`${p.label}-${i}`}>
                  {isNull ? (
                    <line
                      x1={x}
                      x2={x}
                      y1={INNER_H - 4}
                      y2={INNER_H + 4}
                      stroke={VIZ_COLOR.textTertiary}
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                  ) : null}
                  <text
                    x={x}
                    y={INNER_H + 18}
                    textAnchor="middle"
                    className="font-fw-sans text-microbadge normal-case tracking-normal"
                    fill={VIZ_COLOR.textSecondary}
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}

            {/* line + soft area fill, one path per contiguous non-null run */}
            <motion.g
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : { duration: ENTRANCE_MS / 1000 }}
            >
              {runs.map((run) => {
                const runPoints = run.map((i) => ({
                  x: xForIndex(i, count, INNER_W),
                  y: yForPct(points[i]!.pct as number, INNER_H),
                }));
                if (runPoints.length < 2) return null;
                const linePath = runPoints
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                  .join(' ');
                const areaPath =
                  `${linePath} L ${runPoints[runPoints.length - 1]!.x} ${INNER_H} ` +
                  `L ${runPoints[0]!.x} ${INNER_H} Z`;
                return (
                  <g key={run.join('-')}>
                    <path d={areaPath} fill={VIZ_COLOR.accent} fillOpacity={0.12} />
                    <path
                      d={linePath}
                      fill="none"
                      stroke={VIZ_COLOR.accent}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {/* dots — radius encodes n, hollow below the reliability floor */}
              {points.map((p, i) => {
                if (p.pct === null || !Number.isFinite(p.pct)) return null;
                const cx = xForIndex(i, count, INNER_W);
                const cy = yForPct(p.pct, INNER_H);
                const r = dotRadiusForN(p.n);
                const hollow = isHollowDot(p.n);
                const isActive = i === activeIndex;
                const tooltipText = `${Math.round(p.pct)}% · ${p.n ?? '—'} putts`;
                return (
                  <circle
                    key={`${p.label}-${i}`}
                    cx={cx}
                    cy={cy}
                    r={isActive ? r + 1 : r}
                    fill={hollow ? VIZ_COLOR.surface : VIZ_COLOR.accent}
                    stroke={VIZ_COLOR.accent}
                    strokeWidth={hollow ? 2 : isActive ? 2 : 0}
                    tabIndex={0}
                    role="button"
                    aria-label={`${p.label}: ${tooltipText}`}
                    className={cn(
                      'cursor-pointer outline-none transition-[r] [transition-duration:150ms]',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700',
                    )}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => clearActive(i)}
                    onFocus={() => setActiveIndex(i)}
                    onBlur={() => clearActive(i)}
                  />
                );
              })}
            </motion.g>
          </g>
        </svg>

        {active && active.pct !== null ? (
          <div
            className="pointer-events-none absolute z-tooltip -translate-x-1/2 -translate-y-[calc(100%+8px)]"
            style={{ left: `${(activeCx / VIEW_W) * 100}%`, top: `${(activeCy / VIEW_H) * 100}%` }}
          >
            <ChartTooltip
              heading={active.label}
              rows={[{ label: 'Make rate', value: `${Math.round(active.pct)}% · ${active.n ?? '—'} putts` }]}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
