'use client';

/**
 * ============================================================================
 * Dial — a small semicircular calibration dial (mini gauge)
 * ----------------------------------------------------------------------------
 * The tertiary micro-readout of the cluster: a compact 180° SEMICIRCULAR dial
 * for a 0..1 score, with a sweeping fill arc and a NEEDLE that settles to the
 * value on mount (framer-motion). Reads like a calibration meter — built to inset
 * INSIDE a larger instrument (bare), or to stand alone wrapped in an
 * `instrument` InstrumentPanel (`panel`, `depth="inset"`). Snaps under reduced-
 * motion.
 *
 * goodDirection-aware color (green at/above an optional benchmark, warm amber
 * below). A small Fragment-Mono readout sits under the dial.
 *
 * HONESTY: when thin (`samples` < `minSamples`, or no value), the dial dims to a
 * "calibrating" state — a faint track with a centered em-dash, NEVER a needle
 * pinned to a fabricated 0.
 * ========================================================================== */

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { InstrumentPanel } from '../instrument/InstrumentPanel';
import { VIZ_COLOR, VIZ_EASE, VIZ_REVEAL_MS, formatPercent } from './theme';
import type { GoodDirection } from './TrendChip';

export interface DialProps {
  /** Sparse instrument label (shown under the dial, or as the panel header). */
  label: React.ReactNode;
  /** The 0..1 score. Required unless thin/awaiting. */
  value?: number;
  /** Optional benchmark on 0..1 (drives goodDirection-aware color + a tick). */
  benchmark?: number;
  /** Which side of the benchmark is good. Default `up`. */
  goodDirection?: GoodDirection;
  /** Format the readout. Default = whole percent. */
  valueFormatter?: (value: number) => string;
  /** Diameter in px. Default 132. */
  size?: number;
  /** Min samples before the score is trustworthy. Default 2. */
  minSamples?: number;
  /** Samples backing the score (drives the calibrating state). */
  samples?: number;
  /** Force the calibrating (dim) state. */
  awaiting?: boolean;
  /**
   * Wrap in an InstrumentPanel (glass cockpit bezel, `depth="inset"`). Default
   * false — renders bare so it can inset on a larger instrument panel. */
  panel?: boolean;
  className?: string;
}

const VIEWBOX = 200;
const CENTER = VIEWBOX / 2;
const START_ANGLE = -90; // left end of the semicircle
const SWEEP = 180;

/** Polar → cartesian (0° = up, clockwise). */
function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(rad), y: CENTER - radius * Math.cos(rad) };
}

function arcPath(fromDeg: number, toDeg: number, radius: number): string {
  const start = polar(fromDeg, radius);
  const end = polar(toDeg, radius);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function Dial({
  label,
  value,
  benchmark,
  goodDirection = 'up',
  valueFormatter,
  size = 132,
  minSamples = 2,
  samples,
  awaiting = false,
  panel = false,
  className,
}: DialProps) {
  const reduced = useReducedMotion() ?? false;

  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const thin = typeof samples === 'number' && samples < minSamples;
  const isCalibrating = awaiting || !hasValue || thin;

  const fraction = hasValue ? Math.max(0, Math.min(value as number, 1)) : 0;

  const onGoodSide = React.useMemo(() => {
    if (typeof benchmark !== 'number' || !hasValue) return true;
    const v = value as number;
    return goodDirection === 'up' ? v >= benchmark : v <= benchmark;
  }, [benchmark, hasValue, value, goodDirection]);

  const color = onGoodSide ? VIZ_COLOR.accent : VIZ_COLOR.warning;
  const readout = hasValue
    ? valueFormatter
      ? valueFormatter(value as number)
      : formatPercent(fraction)
    : '—';

  const stroke = 14;
  const radius = CENTER - stroke / 2 - 6;
  const trackPath = arcPath(START_ANGLE, START_ANGLE + SWEEP, radius);
  const fillEnd = START_ANGLE + fraction * SWEEP;
  const fillPath = arcPath(START_ANGLE, Math.max(START_ANGLE + 0.01, fillEnd), radius);
  const needleAngle = START_ANGLE + fraction * SWEEP;
  const needleTip = polar(needleAngle, radius - stroke / 2 - 2);
  const benchAngle =
    typeof benchmark === 'number'
      ? START_ANGLE + Math.max(0, Math.min(benchmark, 1)) * SWEEP
      : null;
  const svgH = CENTER + stroke; // the top half + cap room

  const ariaLabel = dialAria(label, readout, isCalibrating, samples, minSamples);

  const dial = (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('flex flex-col items-center', !panel && className)}
    >
      <div aria-hidden className="relative" style={{ width: size, height: (size * svgH) / VIEWBOX }}>
        <svg viewBox={`0 0 ${VIEWBOX} ${svgH}`} width={size}>
          {/* faint track */}
          <path
            d={trackPath}
            fill="none"
            stroke={VIZ_COLOR.textTertiary}
            strokeWidth={stroke}
            strokeLinecap="round"
            opacity={0.16}
          />

          {!isCalibrating ? (
            <>
              {/* fill arc draws on */}
              <motion.path
                d={fillPath}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                pathLength={1}
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={
                  reduced ? { duration: 0 } : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE }
                }
              />

              {/* benchmark tick */}
              {benchAngle !== null ? (
                <line
                  x1={polar(benchAngle, radius + stroke / 2 + 2).x}
                  y1={polar(benchAngle, radius + stroke / 2 + 2).y}
                  x2={polar(benchAngle, radius - stroke / 2 - 2).x}
                  y2={polar(benchAngle, radius - stroke / 2 - 2).y}
                  stroke={VIZ_COLOR.textSecondary}
                  strokeWidth={2}
                  strokeDasharray="2 2"
                />
              ) : null}

              {/* the needle — settles from the left rest position to the value */}
              <motion.line
                x1={CENTER}
                y1={CENTER}
                x2={needleTip.x}
                y2={needleTip.y}
                stroke={VIZ_COLOR.textPrimary}
                strokeWidth={3}
                strokeLinecap="round"
                initial={reduced ? false : { rotate: -SWEEP / 2 }}
                animate={{ rotate: 0 }}
                transition={
                  reduced ? { duration: 0 } : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE }
                }
                style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
              />
              <circle cx={CENTER} cy={CENTER} r={5} fill={VIZ_COLOR.textPrimary} />
            </>
          ) : null}

          {/* centered readout under the arc (mono, dim when calibrating) */}
          <text
            x={CENTER}
            y={CENTER - 4}
            textAnchor="middle"
            className={cn(
              'font-fw-mono',
              isCalibrating ? 'fill-text-tertiary' : 'fill-text-primary',
            )}
            style={{ fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
            fill={isCalibrating ? VIZ_COLOR.textTertiary : VIZ_COLOR.textPrimary}
          >
            {readout}
          </text>
        </svg>
      </div>

      <span
        className={cn(
          'mt-1.5 font-fw-sans text-eyebrow uppercase',
          isCalibrating ? 'text-text-tertiary' : 'text-text-secondary',
        )}
      >
        {isCalibrating ? 'Calibrating' : label}
      </span>
    </div>
  );

  if (!panel) return dial;

  return (
    <InstrumentPanel depth="inset" header={label} padding="md" className={className}>
      {dial}
    </InstrumentPanel>
  );
}

function dialAria(
  label: React.ReactNode,
  readout: string,
  calibrating: boolean,
  samples?: number,
  minSamples?: number,
): string {
  const name = typeof label === 'string' ? label : 'Dial';
  if (calibrating) {
    const counts =
      typeof samples === 'number' && typeof minSamples === 'number'
        ? ` — ${samples} of ${minSamples} samples`
        : '';
    return `${name}: calibrating, awaiting signal${counts}.`;
  }
  return `${name}: ${readout}.`;
}
