/**
 * PuttHeatmap — top-down green: where every putt started, and whether it
 * dropped.
 *
 * Reads the same canonical v3 motion library + Fairway tokens as the rest of
 * round review (mirrors `HoleShotPath`'s component pattern: LazyMotion + m.*
 * dots, `useReducedMotionGuard`, SSR-safe). Purely presentational — the
 * aggregation math lives in `./geometry`, real data comes from
 * `./useRoundPutts` (a separate hook, wired by the caller).
 *
 * Honest-empty: fewer than `MIN_PUTTS` logged putts and the surface says so
 * instead of rendering a sparse, misleading plot.
 */

'use client';

import { useMemo } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { InsufficientData } from '@/components/fairway';
import {
  buildPuttHeatmap,
  formatPct,
  BUCKET_RADII,
  VB,
  HOLE_R,
  MAX_R,
  MISS_SIDE_LABEL,
  type PuttHeatmapData,
} from './geometry';
import type { PuttHeatmapProps } from './types';
import { EASE_CINEMATIC, DURATION, enterVariants, enterTransition, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

/** Below this many logged putts, a plot would be sparse enough to mislead —
 *  show the honest gap instead. Mirrors the `minSampleN` floor other v3
 *  putting-scoped generators use (see `PuttBiasGenerator`). */
const MIN_PUTTS = 5;

/** Tabular-numerals inline style, duplicated (not imported) from
 *  `fairway/charts/theme.ts` on purpose — that file's own header restricts it
 *  to sibling files inside `components/fairway/charts/`. */
const TABULAR_NUMS: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums lining-nums',
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
};

const COLOR = {
  make: 'var(--fw-color-accent-500)',
  miss: 'var(--fw-color-danger)',
  hole: 'var(--fw-color-text-primary)',
  flag: 'var(--fw-color-accent-600)',
  ring: 'var(--fw-viz-grid)',
  ringLabel: 'var(--fw-color-text-tertiary)',
  edge: 'var(--fw-color-border-subtle)',
  dotStroke: 'var(--fw-color-surface)',
} as const;

/** Faster + capped than the canonical 70ms sibling stagger (`stagger()` in
 *  the v3 motion lib): a round's worth of putts can run 25-35+ dots, and the
 *  canonical step would push the last dot's entrance well past a second. */
const DOT_STAGGER_STEP = 0.014;
const DOT_STAGGER_CAP = 26;
function dotDelay(i: number): number {
  return Math.min(i, DOT_STAGGER_CAP) * DOT_STAGGER_STEP;
}

function buildAriaSummary(data: PuttHeatmapData): string {
  if (data.total_putts === 0) return 'Putting heatmap. No putts logged.';
  const parts = [
    `Putting heatmap. ${data.total_putts} putt${data.total_putts === 1 ? '' : 's'} plotted, ${data.total_made} made (${formatPct(data.overall_make_pct)}).`,
  ];
  if (data.miss_bias.dominant) {
    parts.push(
      `Most misses go ${MISS_SIDE_LABEL[data.miss_bias.dominant].toLowerCase()} (${Math.round(data.miss_bias.share * 100)}% of misses).`,
    );
  }
  return parts.join(' ');
}

export function PuttHeatmap({ putts, title = 'Putting heatmap', className }: PuttHeatmapProps) {
  const reduced = useReducedMotionGuard();
  const data = useMemo(() => buildPuttHeatmap(putts), [putts]);
  const ariaSummary = useMemo(() => buildAriaSummary(data), [data]);
  const insufficient = data.total_putts < MIN_PUTTS;

  return (
    <LazyMotion features={loadFeatures}>
      <m.div
        data-slot="putt-heatmap"
        className={cn('flex min-w-0 flex-col gap-3', className)}
        variants={enterVariants}
        initial={reduced ? false : 'hidden'}
        animate="visible"
        transition={enterTransition}
      >
        <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">{title}</p>

        {insufficient ? (
          <InsufficientData
            compact
            title="Not enough putts yet"
            unit="putts"
            current={data.total_putts}
            required={MIN_PUTTS}
          />
        ) : (
          <>
            <div className="relative mx-auto aspect-square w-full max-w-[230px]">
              <svg
                viewBox={`0 0 ${VB.width} ${VB.height}`}
                role="img"
                aria-label={ariaSummary}
                className="h-full w-full overflow-visible"
              >
                <defs>
                  <radialGradient id="putt-heatmap-green" cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stopColor="var(--fw-color-accent-50)" />
                    <stop offset="60%" stopColor="var(--fw-color-accent-100)" />
                    <stop offset="100%" stopColor="var(--fw-color-accent-200)" />
                  </radialGradient>
                </defs>

                {/* the green surface */}
                <circle
                  cx={VB.cx}
                  cy={VB.cy}
                  r={MAX_R}
                  fill="url(#putt-heatmap-green)"
                  stroke={COLOR.edge}
                  strokeWidth={1}
                />

                {/* distance-ring guides — one per real bucket boundary */}
                {BUCKET_RADII.map((ring) => (
                  <g key={ring.id} aria-hidden="true">
                    <circle
                      cx={VB.cx}
                      cy={VB.cy}
                      r={ring.r}
                      fill="none"
                      stroke={COLOR.ring}
                      strokeWidth={0.75}
                      strokeDasharray="2 3"
                    />
                    <text
                      x={VB.cx}
                      y={VB.cy - ring.r - 2.5}
                      textAnchor="middle"
                      fontSize={5.5}
                      fill={COLOR.ringLabel}
                      className="font-fw-mono"
                    >
                      {ring.label}
                    </text>
                  </g>
                ))}

                {/* hole + flag, dead center */}
                <g aria-hidden="true">
                  <line
                    x1={VB.cx}
                    y1={VB.cy - HOLE_R}
                    x2={VB.cx}
                    y2={VB.cy - HOLE_R - 13}
                    stroke={COLOR.hole}
                    strokeWidth={0.8}
                  />
                  <path d={`M ${VB.cx} ${VB.cy - HOLE_R - 13} l 7 2.6 l -7 2.6 z`} fill={COLOR.flag} />
                  <circle cx={VB.cx} cy={VB.cy} r={HOLE_R} fill={COLOR.hole} />
                  <circle cx={VB.cx} cy={VB.cy} r={HOLE_R + 1.4} fill="none" stroke={COLOR.dotStroke} strokeWidth={0.8} />
                </g>

                {/* plotted putts — subtle staggered entrance, gated for reduced motion */}
                <g aria-hidden="true">
                  {data.plotted.map((p, i) => (
                    <m.circle
                      key={p.key}
                      cx={p.x}
                      cy={p.y}
                      r={2.6}
                      fill={p.made ? COLOR.make : COLOR.miss}
                      stroke={COLOR.dotStroke}
                      strokeWidth={0.6}
                      style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                      initial={reduced ? false : { opacity: 0, scale: 0.3 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { duration: DURATION.short, delay: 0.1 + dotDelay(i), ease: EASE_CINEMATIC }
                      }
                    >
                      <title>
                        {`${p.made ? 'Made' : 'Missed'} · ${Math.round(p.distance_feet)} ft${p.miss ? ` · ${MISS_SIDE_LABEL[p.miss]}` : ''}`}
                      </title>
                    </m.circle>
                  ))}
                </g>
              </svg>
            </div>

            {/* compact legend + readout */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
              <div className="flex items-center gap-3">
                <LegendSwatch color={COLOR.make} label="Made" />
                <LegendSwatch color={COLOR.miss} label="Miss" />
              </div>
              <p style={TABULAR_NUMS} className="font-fw-mono text-caption font-semibold tabular-nums text-text-primary">
                {data.total_made}/{data.total_putts}
                <span className="ml-1 font-fw-sans font-normal text-text-tertiary">· {formatPct(data.overall_make_pct)}</span>
              </p>
            </div>

            {data.miss_bias.dominant ? (
              <p className="font-fw-sans text-caption text-text-secondary">
                Mostly missing{' '}
                <span className="font-medium text-text-primary">
                  {MISS_SIDE_LABEL[data.miss_bias.dominant].toLowerCase()}
                </span>
                {' — '}
                {Math.round(data.miss_bias.share * 100)}% of misses.
              </p>
            ) : null}
          </>
        )}
      </m.div>
    </LazyMotion>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
      <i aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export type { PuttHeatmapProps } from './types';
