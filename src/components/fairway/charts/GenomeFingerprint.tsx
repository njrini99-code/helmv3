'use client';

/**
 * ============================================================================
 * GenomeFingerprint — per-dimension diverging bars (§5.2 / cohesion: NOT radars)
 * ----------------------------------------------------------------------------
 * The compare surface for the player genome. DESIGN-SYSTEM §5.2 is explicit:
 * compare two players via diverging bars on a shared 0–100 scale, NEVER two
 * overlaid radars (GenomeRadar stays the SINGLE-series decorative "shape" hero).
 * This component REPLACES the forbidden two-radar overlay.
 *
 * Two modes, one component:
 *   • single  — each dimension's percentile diverges from a `baseline` (default
 *     50 = the team/percentile midline): green to the RIGHT (above baseline),
 *     warm AMBER to the LEFT (below baseline). The "fingerprint" is the shape of
 *     the deviations from average.
 *   • compare — each dimension shows (player A − player B): green to the right
 *     where A leads, amber to the left where B leads. Same shared 0–100 scale.
 *
 * THE HONESTY CONTRACT:
 *   • <3 LIVE dimensions → ChartFrame `insufficient-data` (a genome needs enough
 *     dimensions to be a fingerprint; fewer is a misleading silhouette). "Live"
 *     means a finite, computed value — `null`/NaN dimensions are not counted and
 *     never plotted as a fake 0.
 *   • Amber (VIZ_DIVERGING.negative), never red, for the trailing side.
 *   • Always ships the numeric dimension table via ChartFrame's "view as table"
 *     (the precise readout — color/length is never the only channel).
 * ========================================================================== */

import * as React from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartFrame,
  type ChartFrameState,
  type ChartTableData,
} from './ChartFrame';
import { makeChartTooltip } from './ChartTooltip';
import {
  VIZ_CHROME,
  VIZ_COLOR,
  VIZ_DIVERGING,
  VIZ_FONT,
  VIZ_REVEAL_MS,
  formatSigned,
} from './theme';

/** One genome dimension reading on the shared 0–100 scale. */
export interface GenomeDimension {
  /** dimension name, e.g. "Driving", "Approach", "Putting". */
  label: string;
  /**
   * Percentile / score on the shared 0–100 scale. `null` (or non-finite) means
   * NOT computed for this player — counted as a non-live dimension, never 0.
   */
  value: number | null;
}

export interface GenomeFingerprintProps {
  title?: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  /** Primary player's dimensions (the fingerprint). */
  data: ReadonlyArray<GenomeDimension>;
  /** Primary series label (tooltip / table header). */
  seriesName?: string;
  /**
   * Compare mode: a second player's dimensions, matched by `label`. When given,
   * bars show (primary − compare) per dimension on the shared scale.
   */
  compareWith?: ReadonlyArray<GenomeDimension>;
  /** Compare series label. */
  compareName?: string;
  /**
   * Single-mode divergence baseline (the midline bars diverge from). Default 50
   * (percentile midpoint). Ignored in compare mode (baseline is 0 difference).
   */
  baseline?: number;
  /** Scale max for the shared axis. Default 100. */
  max?: number;
  /** Min live-dimension count before the fingerprint is trustworthy. Default 3. */
  minDimensions?: number;
  height?: number;
  /** Force a state (else derived from live-dimension count). */
  state?: ChartFrameState;
  actions?: React.ReactNode;
  className?: string;
}

interface BarDatum {
  label: string;
  /** The signed diverging value plotted (deviation from baseline / A−B). */
  diverge: number;
  /** The primary raw value (for the tooltip / table). */
  primary: number | null;
  /** The compare raw value, if any. */
  compare: number | null;
}

/**
 * Diverging horizontal genome bars. Single-player (deviation from a percentile
 * baseline) or two-player compare (A − B), both on the shared 0–100 scale.
 * Hosted in the matte ChartFrame with the numeric table fallback. <3 live
 * dimensions → honest insufficient-data.
 */
export function GenomeFingerprint({
  title = 'Genome fingerprint',
  overline,
  subtitle,
  takeaway,
  data,
  seriesName = 'Player',
  compareWith,
  compareName = 'Compared',
  baseline = 50,
  max = 100,
  minDimensions = 3,
  height = 320,
  state,
  actions,
  className,
}: GenomeFingerprintProps) {
  const isCompare = Boolean(compareWith && compareWith.length > 0);

  // Match compare dimensions to primary by label.
  const compareByLabel = React.useMemo(() => {
    const m = new Map<string, number | null>();
    (compareWith ?? []).forEach((d) => m.set(d.label, d.value));
    return m;
  }, [compareWith]);

  // Build plottable rows; a row is "live" when its diverging value is finite.
  const rows: BarDatum[] = React.useMemo(() => {
    return data.map((d) => {
      const primary = Number.isFinite(d.value as number) ? (d.value as number) : null;
      const compare = isCompare
        ? (() => {
            const c = compareByLabel.get(d.label);
            return Number.isFinite(c as number) ? (c as number) : null;
          })()
        : null;

      let diverge = NaN;
      if (isCompare) {
        if (primary !== null && compare !== null) diverge = primary - compare;
      } else if (primary !== null) {
        diverge = primary - baseline;
      }
      return { label: d.label, diverge, primary, compare };
    });
  }, [data, isCompare, compareByLabel, baseline]);

  const liveRows = React.useMemo(
    () => rows.filter((r) => Number.isFinite(r.diverge)),
    [rows],
  );

  // HONESTY CONTRACT — fewer than `minDimensions` live dims → insufficient-data.
  const resolvedState: ChartFrameState =
    state ?? (liveRows.length < minDimensions ? 'insufficient-data' : 'ready');

  // Symmetric domain so the baseline sits dead-center.
  const domainMax = isCompare ? max : Math.max(baseline, max - baseline);
  const domain: [number, number] = [-domainMax, domainMax];

  // Numeric dimension table — the precise readout (always shipped).
  const tableData: ChartTableData = React.useMemo(() => {
    const columns = isCompare
      ? [
          { key: 'label', label: 'Dimension' },
          { key: 'primary', label: seriesName, numeric: true },
          { key: 'compare', label: compareName, numeric: true },
          { key: 'diff', label: 'Difference', numeric: true },
        ]
      : [
          { key: 'label', label: 'Dimension' },
          { key: 'primary', label: seriesName, numeric: true },
          { key: 'diff', label: `vs ${baseline}`, numeric: true },
        ];
    return {
      caption: isCompare ? 'Genome comparison by dimension' : 'Genome percentile by dimension',
      columns,
      rows: rows.map((r) => ({
        label: r.label,
        primary: r.primary === null ? '—' : Math.round(r.primary),
        compare: r.compare === null ? '—' : Math.round(r.compare),
        diff: Number.isFinite(r.diverge) ? formatSigned(r.diverge, 0) : '—',
      })),
    };
  }, [isCompare, rows, seriesName, compareName, baseline]);

  const leftLabel = isCompare ? compareName : 'Below';
  const rightLabel = isCompare ? seriesName : 'Above';

  return (
    <ChartFrame
      title={title}
      overline={overline}
      subtitle={subtitle}
      takeaway={takeaway}
      state={resolvedState}
      height={height}
      tableData={tableData}
      actions={actions}
      className={className}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minHeight={height}
        initialDimension={{ width: 1, height }}
      >
        <BarChart
          data={liveRows}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
          barCategoryGap="26%"
          stackOffset="sign"
        >
          {/* calm: vertical hairline grid only on the value axis */}
          <XAxis
            type="number"
            domain={domain}
            stroke={VIZ_CHROME.axis}
            tick={{
              fill: VIZ_COLOR.textTertiary,
              fontSize: VIZ_FONT.tickSize,
              fontFamily: VIZ_FONT.numeric,
            }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatSigned(v, 0)}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke={VIZ_CHROME.axis}
            tick={{
              fill: VIZ_COLOR.textSecondary,
              fontSize: VIZ_FONT.labelSize,
              fontFamily: VIZ_FONT.numeric,
            }}
            tickLine={false}
            axisLine={false}
            width={104}
          />

          {/* the ONE emphasized baseline (0 = at-baseline / players even) */}
          <ReferenceLine x={0} stroke={VIZ_CHROME.benchmark} strokeWidth={1.25} />

          <Tooltip
            cursor={{ fill: 'var(--fw-color-accent-50)', opacity: 0.4 }}
            content={makeChartTooltip({
              headingFormatter: (label) => String(label),
              valueFormatter: (v) => formatSigned(Number(v), 0),
            })}
          />

          <Bar
            dataKey="diverge"
            name={isCompare ? `${rightLabel} − ${leftLabel}` : `vs ${baseline}`}
            radius={[0, 4, 4, 0]}
            isAnimationActive
            animationDuration={VIZ_REVEAL_MS}
          >
            {liveRows.map((r, i) => (
              <Cell
                key={i}
                // green to the right (lead/above), warm amber to the left
                fill={r.diverge >= 0 ? VIZ_DIVERGING.positive : VIZ_DIVERGING.negative}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
