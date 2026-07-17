'use client';

/**
 * ============================================================================
 * EkgSparkline — Pulse Grid's per-team 30-day heartbeat row
 * ----------------------------------------------------------------------------
 * `Sparkline` can't render this spec: it draws ONE polyline through numeric
 * values on a shared vertical scale, but the Pulse Grid needs TWO independent
 * lanes sharing a baseline (green activity ticks that scale to their own
 * row's max, and red error spikes that must stay visually "unmissable"
 * regardless of the activity scale) plus a trailing halo dot that is a
 * distinct shape per state, not a color-only signal. Built from the same
 * primitives Sparkline itself uses (hand-rolled SVG, framer-motion draw-on,
 * `useReducedMotion`, VIZ_* chart theme tokens) rather than inventing a new
 * visual vocabulary.
 *
 * HONESTY CONTRACT: a bucket with zero activity and zero errors draws
 * nothing (a flat baseline segment) — never a fabricated tick. The halo is
 * shape-coded (filled disc / hollow ring / dotted ring), not color-only, so
 * it reads correctly without color.
 * ========================================================================== */

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VIZ_COLOR, VIZ_EASE, VIZ_REVEAL_MS } from './theme';

export type EkgHalo = 'fresh' | 'cooling' | 'silent';

export interface EkgBucket {
  date: string;
  activity: number;
  errors: number;
  critical: boolean;
}

export interface EkgSparklineProps {
  /** Oldest → newest, one entry per day. */
  buckets: readonly EkgBucket[];
  halo: EkgHalo;
  /** Accessible name prefix, e.g. a team's name. */
  label?: string;
  width?: number;
  height?: number;
  className?: string;
}

const HALO_COLOR: Record<EkgHalo, string> = {
  fresh: VIZ_COLOR.accent,
  cooling: VIZ_COLOR.textTertiary,
  silent: VIZ_COLOR.danger,
};

const HALO_LABEL: Record<EkgHalo, string> = {
  fresh: 'active in the last 2 days',
  cooling: 'quiet for 3 to 14 days',
  silent: 'silent for 14+ days (or no activity in the last 30)',
};

export function EkgSparkline({
  buckets,
  halo,
  label,
  width = 220,
  height = 32,
  className,
}: EkgSparklineProps) {
  const reduced = useReducedMotion() ?? false;
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(wrapRef, { once: true, amount: 0.4 });

  const pad = 4;
  const innerW = Math.max(1, width - pad * 2 - 10); // reserve 10px for the halo dot
  const innerH = Math.max(1, height - pad * 2);
  const baselineY = pad + innerH * 0.62;
  const maxActivity = Math.max(1, ...buckets.map((b) => b.activity));
  const stepX = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;

  const totalActivity = buckets.reduce((sum, b) => sum + b.activity, 0);
  const totalErrors = buckets.reduce((sum, b) => sum + b.errors, 0);
  const hasCritical = buckets.some((b) => b.critical);
  const summary =
    `${label ? `${label}: ` : ''}${totalActivity} activity events, ${totalErrors} error events` +
    `${hasCritical ? ' including critical' : ''} over ${buckets.length} days. ${HALO_LABEL[halo]}.`;

  const lastX = pad + (buckets.length - 1) * stepX;
  const dotX = width - pad - 4;

  return (
    <span
      ref={wrapRef}
      data-slot="ekg-sparkline"
      data-halo={halo}
      role="img"
      aria-label={summary}
      className={cn('inline-block align-middle', className)}
      style={{ width, height }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
        {/* Baseline */}
        <line
          x1={pad}
          y1={baselineY}
          x2={pad + innerW}
          y2={baselineY}
          stroke={VIZ_COLOR.textTertiary}
          strokeOpacity={0.25}
          strokeWidth={1}
        />
        <motion.g
          initial={reduced ? false : { opacity: 0 }}
          animate={reduced || inView ? { opacity: 1 } : { opacity: 0 }}
          transition={reduced ? { duration: 0 } : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE }}
        >
          {buckets.map((b, i) => {
            const x = pad + i * stepX;
            const nodes: React.ReactNode[] = [];
            if (b.activity > 0) {
              const h = Math.max(2, (b.activity / maxActivity) * (innerH * 0.42));
              nodes.push(
                <line
                  key={`a-${b.date}`}
                  x1={x}
                  y1={baselineY}
                  x2={x}
                  y2={baselineY - h}
                  stroke={VIZ_COLOR.accent}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />,
              );
            }
            if (b.errors > 0) {
              // Deliberately near-fixed amplitude (not scaled to the row's own
              // max) — the spec calls these "unmissable against the calm
              // green baseline," which a proportionally-scaled spike would
              // undercut on an otherwise-quiet row.
              const h = innerH * (b.critical ? 0.58 : 0.4);
              nodes.push(
                <line
                  key={`e-${b.date}`}
                  x1={x}
                  y1={baselineY}
                  x2={x}
                  y2={baselineY - h}
                  stroke={VIZ_COLOR.danger}
                  strokeWidth={b.critical ? 2 : 1.5}
                  strokeLinecap="round"
                />,
              );
            }
            return nodes;
          })}
        </motion.g>

        {/* Trailing halo dot — shape-coded, not color-only. */}
        <motion.g
          initial={reduced ? false : { opacity: 0, scale: 0.5 }}
          animate={reduced || inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 0.24, ease: VIZ_EASE, delay: VIZ_REVEAL_MS / 1000 }
          }
          style={{ transformOrigin: `${dotX}px ${baselineY}px` }}
        >
          {halo === 'fresh' ? (
            <circle cx={dotX} cy={baselineY} r={3.25} fill={HALO_COLOR.fresh} />
          ) : halo === 'cooling' ? (
            <circle cx={dotX} cy={baselineY} r={3.25} fill="none" stroke={HALO_COLOR.cooling} strokeWidth={1.5} />
          ) : (
            <circle
              cx={dotX}
              cy={baselineY}
              r={3.5}
              fill="none"
              stroke={HALO_COLOR.silent}
              strokeWidth={1.5}
              strokeDasharray="1.5 1.5"
            />
          )}
        </motion.g>
        {/* Connector from the last data point to the halo dot. */}
        {buckets.length > 0 ? (
          <line
            x1={lastX}
            y1={baselineY}
            x2={dotX}
            y2={baselineY}
            stroke={VIZ_COLOR.textTertiary}
            strokeOpacity={0.25}
            strokeWidth={1}
          />
        ) : null}
      </svg>
    </span>
  );
}
