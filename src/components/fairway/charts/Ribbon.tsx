'use client';

/**
 * ============================================================================
 * Ribbon — the BOLD filled-gradient trend instrument (not a thin line)
 * ----------------------------------------------------------------------------
 * A cockpit trend readout that mounts into the signature `instrument`
 * InstrumentPanel: a thick green AREA ribbon with a vertical gradient fill
 * fading to transparent, a crisp bright top stroke (the trace), and an optional
 * dashed benchmark baseline. The ribbon DRAWS ON left-to-right on mount (a
 * clip-rect wipe via framer-motion) and snaps under reduced-motion.
 *
 * It's expressive HERO art, not a sparkline — sized to anchor a flanking panel.
 * The accessible path pairs the existing ChartCrosshair (keyboard ← → traverse
 * + aria-live announcements) with a "view as table" readout; the SVG stays
 * aria-hidden under the figure's role="img" contract.
 *
 * HONESTY: <2 finite points → the panel's honest awaiting state (a dim,
 * calibrating instrument), never a fabricated flat line at zero.
 * ========================================================================== */

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { InstrumentPanel } from '../instrument/InstrumentPanel';
import { Readout } from '../instrument/Readout';
import { ChartCrosshairLiveRegion, useChartCrosshair } from './ChartCrosshair';
import { InstrumentTable, InstrumentTableToggle } from './InstrumentTable';
import type { ChartTableData } from './ChartFrame';
import {
  TABULAR_NUMS,
  VIZ_CHROME,
  VIZ_COLOR,
  VIZ_EASE,
  VIZ_REVEAL_MS,
  chartAriaLabel,
} from './theme';

export interface RibbonPoint {
  /** x label (date / round number / category). */
  x: string | number;
  /** y value. */
  y: number;
}

export interface RibbonProps {
  /** Sparse instrument label (the panel bezel headline). */
  title: React.ReactNode;
  /** Tiny uppercase overline (the instrument's category). */
  overline?: string;
  /** Concise spoken takeaway for the figure's `aria-label`. */
  takeaway?: string;
  data: ReadonlyArray<RibbonPoint>;
  /** Dashed benchmark baseline (team average / PGA / par). */
  benchmark?: { value: number; label?: string };
  /** Format y values for the readout / table / announcements. */
  valueFormatter?: (value: number) => string;
  /** Series name spoken in the a11y crosshair announcement. */
  seriesName?: string;
  /** Plot height in px. Default 200. */
  height?: number;
  /** Min finite points before the trend is trustworthy. Default 2. */
  minPoints?: number;
  /** Force the awaiting (dim) state. */
  awaiting?: boolean;
  className?: string;
}

const VIEW_W = 600;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

export function Ribbon({
  title,
  overline,
  takeaway,
  data,
  benchmark,
  valueFormatter,
  seriesName = 'Trend',
  height = 200,
  minPoints = 2,
  awaiting = false,
  className,
}: RibbonProps) {
  const reduced = useReducedMotion() ?? false;
  const uid = React.useId();
  const gradId = `fw-ribbon-grad-${uid}`;
  const clipId = `fw-ribbon-clip-${uid}`;
  const [showTable, setShowTable] = React.useState(false);

  const fmt = React.useCallback(
    (v: number) => (valueFormatter ? valueFormatter(v) : String(v)),
    [valueFormatter],
  );

  const points = React.useMemo(
    () => data.filter((d): d is RibbonPoint => Number.isFinite(d.y)),
    [data],
  );

  const isAwaiting = awaiting || points.length < minPoints;

  // Crosshair a11y controller (keyboard traverse + live region).
  const crosshairPoints = React.useMemo(
    () => points.map((p) => ({ label: p.x, value: p.y })),
    [points],
  );
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const crosshair = useChartCrosshair({
    points: crosshairPoints,
    formatValue: fmt,
    seriesName,
    onActiveIndexChange: setActiveIndex,
  });

  const tableData: ChartTableData = {
    caption: typeof title === 'string' ? title : 'Trend data',
    columns: [
      { key: 'x', label: 'Point' },
      { key: 'y', label: seriesName, numeric: true },
    ],
    rows: points.map((p) => ({ x: String(p.x), y: fmt(p.y) })),
  };
  const hasTable = tableData.rows.length > 0 && !isAwaiting;

  // ---- Scales -------------------------------------------------------------
  const innerW = VIEW_W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const { min, max } = React.useMemo(() => {
    const ys = points.map((p) => p.y);
    if (benchmark) ys.push(benchmark.value);
    const lo = ys.length ? Math.min(...ys) : 0;
    const hi = ys.length ? Math.max(...ys) : 1;
    if (lo === hi) return { min: lo - 1, max: hi + 1 };
    const pad = (hi - lo) * 0.12;
    return { min: lo - pad, max: hi + pad };
  }, [points, benchmark]);

  const xAt = React.useCallback(
    (i: number) =>
      PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
    [innerW, points.length],
  );
  const yAt = React.useCallback(
    (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH,
    [innerH, min, max],
  );

  const linePath = React.useMemo(() => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.y)}`).join(' ');
  }, [points, xAt, yAt]);

  const areaPath = React.useMemo(() => {
    if (points.length === 0) return '';
    const base = PAD.top + innerH;
    const top = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.y)}`).join(' ');
    return `${top} L ${xAt(points.length - 1)} ${base} L ${xAt(0)} ${base} Z`;
  }, [points, xAt, yAt, innerH]);

  const active = activeIndex !== null ? points[activeIndex] : undefined;
  const benchY = benchmark ? yAt(benchmark.value) : null;

  const first = points[0];
  const last = points[points.length - 1];
  const trendDelta = first && last ? last.y - first.y : undefined;

  const ariaLabel = chartAriaLabel(
    typeof title === 'string' ? title : 'Trend',
    takeaway ??
      (first && last && points.length >= 2
        ? `${seriesName} from ${fmt(first.y)} to ${fmt(last.y)}`
        : 'awaiting signal'),
  );

  return (
    <InstrumentPanel
      depth="base"
      eyebrow={overline}
      header={title}
      readout={
        !isAwaiting ? (
          <div className="flex items-center gap-2">
            {last ? (
              <Readout
                value={last.y}
                display={valueFormatter ? fmt(last.y) : undefined}
                format={valueFormatter ? undefined : { maximumFractionDigits: 2 }}
                size="sm"
                align="end"
                label={seriesName}
                delta={
                  typeof trendDelta === 'number'
                    ? {
                        value: trendDelta,
                        format: (v) => {
                          // `fmt` (the caller's valueFormatter, e.g. FairwayBrief's
                          // fmtSG) may ALREADY prefix its own +/− sign. Strip any
                          // leading sign glyph before prepending ours, or a signed
                          // formatter double-signs ("▼ −+0.56" instead of "▼ −0.56").
                          const magnitude = fmt(Math.abs(v)).replace(/^[+\-−]/, '');
                          return `${v >= 0 ? '+' : '−'}${magnitude}`;
                        },
                      }
                    : undefined
                }
              />
            ) : null}
            {hasTable ? (
              <InstrumentTableToggle show={showTable} onToggle={() => setShowTable((v) => !v)} />
            ) : null}
          </div>
        ) : undefined
      }
      className={className}
    >
      {showTable && hasTable ? (
        <InstrumentTable data={tableData} />
      ) : isAwaiting ? (
        /* honest dim instrument — a faint baseline + awaiting readout */
        <div role="img" aria-label={ariaLabel} className="flex items-center justify-center" style={{ height }}>
          <Readout
            state="awaiting"
            size="md"
            samples={{ have: points.length, need: minPoints }}
            awaitingLabel="Awaiting points"
            label={seriesName}
          />
        </div>
      ) : (
        <div role="img" aria-label={ariaLabel}>
          {/* The keyboard widget wraps the plot; the SVG stays aria-hidden. */}
          <div
            {...crosshair.containerProps}
            className={cn(
              'relative w-full rounded-fw-md',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            )}
            style={{ height }}
          >
            <svg
              viewBox={`0 0 ${VIEW_W} ${height}`}
              width="100%"
              height={height}
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                {/* bold green vertical gradient fading to transparent */}
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VIZ_COLOR.accent} stopOpacity={0.42} />
                  <stop offset="55%" stopColor={VIZ_COLOR.accent} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={VIZ_COLOR.accent} stopOpacity={0.02} />
                </linearGradient>
                {/* draw-on wipe: a clip-rect that grows L→R on mount */}
                <clipPath id={clipId}>
                  <motion.rect
                    x={0}
                    y={0}
                    height={height}
                    initial={reduced ? false : { width: 0 }}
                    animate={{ width: VIEW_W }}
                    transition={
                      reduced ? { duration: 0 } : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE }
                    }
                  />
                </clipPath>
              </defs>

              {/* benchmark baseline (under the ribbon, not clipped) */}
              {benchY !== null ? (
                <line
                  x1={PAD.left}
                  x2={VIEW_W - PAD.right}
                  y1={benchY}
                  y2={benchY}
                  stroke={VIZ_CHROME.benchmark}
                  strokeWidth={1.25}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}

              {/* the ribbon: filled area + crisp top trace, wiped on by the clip */}
              <g clipPath={`url(#${clipId})`}>
                <path d={areaPath} fill={`url(#${gradId})`} />
                <path
                  d={linePath}
                  fill="none"
                  stroke={VIZ_COLOR.accent}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>

              {/* active crosshair: hairline + focused point ring */}
              {active && activeIndex !== null ? (
                <g>
                  <line
                    x1={xAt(activeIndex)}
                    x2={xAt(activeIndex)}
                    y1={PAD.top}
                    y2={PAD.top + innerH}
                    stroke={VIZ_CHROME.benchmark}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={xAt(activeIndex)}
                    cy={yAt(active.y)}
                    r={5}
                    fill={VIZ_COLOR.surface}
                    stroke={VIZ_COLOR.accent}
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ) : null}
            </svg>

            {/* benchmark label pinned at the baseline (crisp DOM text) */}
            {benchmark?.label && benchY !== null ? (
              <span
                className="pointer-events-none absolute right-2 -translate-y-full font-fw-sans text-eyebrow uppercase text-text-tertiary"
                style={{ top: `${(benchY / height) * 100}%` }}
              >
                {benchmark.label}
              </span>
            ) : null}

            {/* live readout of the focused point (visible, mono) */}
            {active ? (
              <span
                style={TABULAR_NUMS}
                className="pointer-events-none absolute left-2 top-1 rounded-fw-sm bg-surface/90 px-2 py-0.5 font-fw-mono text-caption font-semibold text-text-primary shadow-soft"
              >
                {String(active.x)} · {fmt(active.y)}
              </span>
            ) : null}
          </div>

          <ChartCrosshairLiveRegion announcement={crosshair.announcement} />
        </div>
      )}
    </InstrumentPanel>
  );
}
