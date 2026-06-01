'use client';

/**
 * ============================================================================
 * RadialGauge — the cockpit centerpiece (sweeping arc dial + big readout)
 * ----------------------------------------------------------------------------
 * The focal HERO CHART INSTRUMENT of the cluster. It mounts into the signature
 * `instrument` InstrumentPanel (the frosted-glass bezel, `depth="raised"`) and
 * reuses its honest `Readout` for the huge centered Fragment-Mono value.
 *
 * The dial itself: a thick PROGRESS ARC sweeping over a faint track on a ~270°
 * open cockpit face. The arc SWEEPS from 0 on mount (framer-motion pathLength),
 * the cap settles, and it snaps under reduced-motion.
 *
 * goodDirection-aware color: a value on the GOOD side of the benchmark glows
 * helm green (gaining); on the caution side it reads warm amber (losing) — color
 * is never the only channel (the centered readout, the cap, and a verdict chip
 * carry it too). An optional benchmark tick marks the reference (e.g. the 50%
 * coin flip), and the panel rim glows green (`tone="accent"`) only when gaining.
 *
 * HONESTY: with <2 samples (or `awaiting`), the panel shows a DIM "awaiting
 * signal — N of M" gauge (faint track + Readout `state="awaiting"`), never an
 * authoritative 0%. role="img" + chartAriaLabel + a "view as table" readout
 * cover the a11y path. Sizes md | lg.
 * ========================================================================== */

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { InstrumentPanel } from '../instrument/InstrumentPanel';
import { Readout } from '../instrument/Readout';
import { InstrumentTable, InstrumentTableToggle } from './InstrumentTable';
import type { ChartTableData } from './ChartFrame';
import {
  VIZ_COLOR,
  VIZ_EASE,
  VIZ_REVEAL_MS,
  chartAriaLabel,
  formatPercent,
} from './theme';
import type { GoodDirection } from './TrendChip';

export type RadialGaugeSize = 'md' | 'lg';

export interface RadialGaugeProps {
  /** Sparse instrument label (the panel bezel headline). */
  title: React.ReactNode;
  /** Tiny uppercase overline (the instrument's category). */
  overline?: string;
  /** Caption under the value, e.g. "win rate". */
  readoutLabel?: string;
  /** Concise spoken takeaway for the figure's `aria-label`. */
  takeaway?: string;
  /**
   * The reading. Either a 0..1 fraction (with `max` = 1, the default) or an
   * absolute value with explicit `max` (e.g. value=72, max=100). Required
   * unless `awaiting`. */
  value?: number;
  /** Scale ceiling. Default 1 (so `value` is a 0..1 fraction). */
  max?: number;
  /**
   * Optional benchmark on the same scale (e.g. 0.5 = the coin flip). Drawn as a
   * tick AND used to decide gaining (good side) vs caution. */
  benchmark?: number;
  /**
   * Which side of the benchmark is GOOD. `up` → at/above glows green; `down` →
   * at/below glows green (lower-is-better KPIs). Default `up`. */
  goodDirection?: GoodDirection;
  /** Format the centered readout. Default = a whole-percent of value/max. */
  valueFormatter?: (value: number, max: number) => string;
  /** Instrument size. Default `lg` (the focal centerpiece). */
  size?: RadialGaugeSize;
  /** Min samples before the reading is trustworthy. Default 2. */
  minSamples?: number;
  /** How many samples back the reading (drives the honest awaiting state). */
  samples?: number;
  /** Force the awaiting (dim) state regardless of `samples`. */
  awaiting?: boolean;
  /** What's being counted in the awaiting readout, e.g. "resolved predictions". */
  unit?: string;
  className?: string;
}

/* ---- Arc geometry: a 270° open dial (gap at the bottom) ------------------ */
const START_ANGLE = 135; // degrees, clockwise sweep
const SWEEP = 270;
const VIEWBOX = 200;
const CENTER = VIEWBOX / 2;

const SIZE_PX: Record<RadialGaugeSize, number> = { md: 184, lg: 240 };
const STROKE: Record<RadialGaugeSize, number> = { md: 16, lg: 20 };
const READOUT_SIZE: Record<RadialGaugeSize, 'lg' | 'hero'> = { md: 'lg', lg: 'hero' };

/** Polar → cartesian on the arc. */
function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

/** SVG arc path between two angles at a fixed radius (clockwise). */
function arcPath(fromDeg: number, toDeg: number, radius: number): string {
  const start = polar(fromDeg, radius);
  const end = polar(toDeg, radius);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function RadialGauge({
  title,
  overline,
  readoutLabel,
  takeaway,
  value,
  max = 1,
  benchmark,
  goodDirection = 'up',
  valueFormatter,
  size = 'lg',
  minSamples = 2,
  samples,
  awaiting = false,
  unit = 'samples',
  className,
}: RadialGaugeProps) {
  const reduced = useReducedMotion() ?? false;
  const [showTable, setShowTable] = React.useState(false);

  const safeMax = max > 0 ? max : 1;
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const starvedBySamples = typeof samples === 'number' && samples < minSamples;
  const isAwaiting = awaiting || !hasValue || starvedBySamples;

  const fraction = hasValue ? Math.max(0, Math.min(value as number, safeMax)) / safeMax : 0;

  // goodDirection-aware verdict.
  const onGoodSide = React.useMemo(() => {
    if (typeof benchmark !== 'number' || !hasValue) return true;
    const v = value as number;
    return goodDirection === 'up' ? v >= benchmark : v <= benchmark;
  }, [benchmark, hasValue, value, goodDirection]);

  const arcColor = onGoodSide ? VIZ_COLOR.accent : VIZ_COLOR.warning;
  const verdictWord = onGoodSide ? 'Gaining' : 'Caution';

  const formatReadout = React.useCallback(
    (v: number) => (valueFormatter ? valueFormatter(v, safeMax) : formatPercent(v / safeMax)),
    [valueFormatter, safeMax],
  );
  const formattedReadout = hasValue ? formatReadout(value as number) : '—';

  // Geometry.
  const px = SIZE_PX[size];
  const stroke = STROKE[size];
  const radius = CENTER - stroke / 2 - 6;
  const trackPath = arcPath(START_ANGLE, START_ANGLE + SWEEP, radius);
  const progressEnd = START_ANGLE + fraction * SWEEP;
  const progressPath = arcPath(START_ANGLE, Math.max(START_ANGLE + 0.01, progressEnd), radius);
  const cap = polar(progressEnd, radius);
  const benchAngle =
    typeof benchmark === 'number'
      ? START_ANGLE + (Math.max(0, Math.min(benchmark, safeMax)) / safeMax) * SWEEP
      : null;

  // Accessible readout table.
  const tableData: ChartTableData = {
    caption: typeof title === 'string' ? `${title} reading` : 'Gauge reading',
    columns: [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value', numeric: true },
    ],
    rows: [
      { metric: 'Reading', value: formattedReadout },
      ...(typeof benchmark === 'number'
        ? [
            { metric: 'Benchmark', value: formatReadout(benchmark) },
            { metric: 'Verdict', value: verdictWord },
          ]
        : []),
      ...(typeof samples === 'number' ? [{ metric: 'Samples', value: String(samples) }] : []),
    ],
  };
  const hasTable = tableData.rows.length > 0 && !isAwaiting;

  const ariaLabel = chartAriaLabel(
    typeof title === 'string' ? title : 'Gauge',
    takeaway ??
      (hasValue
        ? `${formattedReadout}${typeof benchmark === 'number' ? `, ${verdictWord.toLowerCase()} vs benchmark` : ''}`
        : 'awaiting signal'),
  );

  return (
    <InstrumentPanel
      depth="raised"
      tone={!isAwaiting && onGoodSide ? 'accent' : 'neutral'}
      padding={size === 'lg' ? 'lg' : 'md'}
      eyebrow={overline}
      header={title}
      readout={
        hasTable ? (
          <InstrumentTableToggle show={showTable} onToggle={() => setShowTable((v) => !v)} />
        ) : undefined
      }
      className={className}
    >
      {showTable && hasTable ? (
        <InstrumentTable data={tableData} />
      ) : (
        <div role="img" aria-label={ariaLabel} className="flex flex-col items-center">
          <div aria-hidden className="relative" style={{ width: px, height: px }}>
            <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} width={px} height={px}>
              {/* faint track (always shown — the dim gauge face when awaiting) */}
              <path
                d={trackPath}
                fill="none"
                stroke={VIZ_COLOR.textTertiary}
                strokeWidth={stroke}
                strokeLinecap="round"
                opacity={0.16}
              />

              {!isAwaiting ? (
                <>
                  {/* progress arc — sweeps on mount via pathLength draw-on */}
                  <motion.path
                    d={progressPath}
                    fill="none"
                    stroke={arcColor}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    pathLength={1}
                    initial={reduced ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE }
                    }
                  />

                  {/* settling cap — the bright "needle head" at the arc tip */}
                  <motion.circle
                    cx={cap.x}
                    cy={cap.y}
                    r={stroke / 2 + 2}
                    fill={VIZ_COLOR.surface}
                    stroke={arcColor}
                    strokeWidth={3}
                    initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { delay: VIZ_REVEAL_MS / 1000, duration: 0.28, ease: VIZ_EASE }
                    }
                    style={{ transformOrigin: `${cap.x}px ${cap.y}px` }}
                  />

                  {/* benchmark tick — a short radial mark across the arc band */}
                  {benchAngle !== null ? (
                    <line
                      x1={polar(benchAngle, radius + stroke / 2 + 3).x}
                      y1={polar(benchAngle, radius + stroke / 2 + 3).y}
                      x2={polar(benchAngle, radius - stroke / 2 - 3).x}
                      y2={polar(benchAngle, radius - stroke / 2 - 3).y}
                      stroke={VIZ_COLOR.textSecondary}
                      strokeWidth={2}
                      strokeDasharray="2 2"
                    />
                  ) : null}
                </>
              ) : null}
            </svg>

            {/* the centered cockpit readout — honest live / awaiting display */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Readout
                value={hasValue ? fraction : undefined}
                display={hasValue ? formattedReadout : undefined}
                size={READOUT_SIZE[size]}
                state={isAwaiting ? 'awaiting' : 'live'}
                samples={
                  typeof samples === 'number' ? { have: samples, need: minSamples } : undefined
                }
                awaitingLabel={`Awaiting ${unit}`}
                label={readoutLabel}
                align="start"
                className="items-center text-center"
              />
            </div>
          </div>

          {/* verdict chip — color is never the only channel (word + dot) */}
          {typeof benchmark === 'number' && !isAwaiting ? (
            <span
              data-direction={onGoodSide ? 'gaining' : 'caution'}
              className={cn(
                'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
                'font-fw-sans text-caption font-semibold',
                onGoodSide
                  ? 'bg-fw-success-bg text-fw-success'
                  : 'bg-fw-warning-bg text-fw-warning',
              )}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: arcColor }}
              />
              {verdictWord}
            </span>
          ) : null}
        </div>
      )}
    </InstrumentPanel>
  );
}
