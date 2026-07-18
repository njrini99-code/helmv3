'use client';

/**
 * ============================================================================
 * TrendChart — Recharts line / area, re-skinned to cream/green tokens (§5.2)
 * ----------------------------------------------------------------------------
 * Progress / trends: a green line with a soft area gradient, dots on hover
 * only, calm hairline horizontal gridlines, an optional dashed benchmark
 * reference line (team-average / PGA), and tournament markers as ReferenceDots.
 *
 * Wrapped in ChartFrame (matte) with a built-in "view as table" fallback.
 * The single glass element is the RechartsTooltip.
 * ========================================================================== */

import * as React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
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
import { VIZ_CHROME, VIZ_COLOR, VIZ_DEFS, VIZ_FONT, VIZ_REVEAL_MS } from './theme';

export interface TrendPoint {
  /** x label (date string, round number, etc.) */
  x: string | number;
  /** y value */
  y: number;
  /**
   * Optional marker (e.g. a tournament, a deploy) rendered as a
   * ReferenceDot. `tone` is additive (default `undefined` → the original
   * accent-green ring, unchanged for every existing caller) — pass it to
   * color-code the marker itself, e.g. a deploy ledger's improved/neutral/
   * regressed verdict.
   */
  marker?: { label?: string; tone?: 'success' | 'neutral' | 'danger' };
}

/** Marker ring color per tone — `undefined`/omitted keeps the original
 *  single accent-green ring every pre-existing TrendChart caller renders. */
const MARKER_TONE_COLOR: Record<'success' | 'neutral' | 'danger', string> = {
  success: VIZ_COLOR.accent,
  neutral: 'var(--fw-color-warm-500)',
  danger: VIZ_COLOR.danger,
};

export interface TrendChartProps {
  title: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  data: TrendPoint[];
  /** Dashed benchmark reference line (e.g. team average / PGA baseline). */
  benchmark?: { value: number; label?: string };
  /** y-axis value formatter for ticks + tooltip. */
  valueFormatter?: (value: number) => string;
  /** Render as a bare line (no area fill). Default = area. */
  variant?: 'area' | 'line';
  height?: number;
  state?: ChartFrameState;
  actions?: React.ReactNode;
  className?: string;
}

/** Recharts-shaped point row (x renamed to a generic key). */
interface Row {
  x: string | number;
  y: number;
}

/**
 * Fits a y-axis domain to the DATA, not Recharts' own default `[0, 'auto']`
 * — that default floors every chart at 0, so a series that lives entirely in
 * a narrow band well above zero (e.g. a golf scoring average of 74-77)
 * renders as a near-flat line pinned to the top of a 0-80 axis, ~85% dead
 * space. Padding is proportional to the series' own spread, with a floor so
 * a near-flat (or single-point) series still gets visible headroom above
 * and below the line rather than collapsing to zero height.
 *
 * `benchmarkValue` (a dashed reference line, e.g. team average / PGA
 * baseline) is folded into the min/max so it's never clipped off-chart.
 * Returns `undefined` for an empty series — callers fall back to Recharts'
 * own `['auto', 'auto']`.
 */
export function computeTrendYDomain(
  values: readonly number[],
  benchmarkValue?: number,
): [number, number] | undefined {
  const finite = values.filter((v) => Number.isFinite(v));
  if (benchmarkValue !== undefined && Number.isFinite(benchmarkValue)) finite.push(benchmarkValue);
  if (finite.length === 0) return undefined;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const pad = Math.max(span * 0.15, Math.max(Math.abs(max), 1) * 0.05);
  return [min - pad, max + pad];
}

export function TrendChart({
  title,
  overline,
  subtitle,
  takeaway,
  data,
  benchmark,
  valueFormatter,
  variant = 'area',
  height = 240,
  state,
  actions,
  className,
}: TrendChartProps) {
  const fmt = React.useCallback(
    (v: number) => (valueFormatter ? valueFormatter(v) : String(v)),
    [valueFormatter],
  );

  const rows: Row[] = React.useMemo(() => data.map((d) => ({ x: d.x, y: d.y })), [data]);
  const markers = React.useMemo(() => data.filter((d) => d.marker), [data]);

  const yDomain = React.useMemo(
    () => computeTrendYDomain(rows.map((r) => r.y), benchmark?.value),
    [rows, benchmark],
  );

  const resolvedState: ChartFrameState = state ?? (data.length === 0 ? 'empty' : 'ready');

  const tableData: ChartTableData = {
    caption: typeof title === 'string' ? title : 'Trend data',
    columns: [
      { key: 'x', label: 'Point' },
      { key: 'y', label: 'Value', numeric: true },
    ],
    rows: data.map((d) => ({ x: String(d.x), y: fmt(d.y) })),
  };

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
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={VIZ_DEFS.areaGradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={VIZ_COLOR.accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={VIZ_COLOR.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* calm: hairline horizontal gridlines only, no vertical grid */}
          <CartesianGrid stroke={VIZ_CHROME.grid} horizontal vertical={false} />

          <XAxis
            dataKey="x"
            stroke={VIZ_CHROME.axis}
            tick={{ fill: VIZ_COLOR.textTertiary, fontSize: VIZ_FONT.tickSize, fontFamily: VIZ_FONT.numeric }}
            tickLine={false}
            axisLine={{ stroke: VIZ_CHROME.grid }}
            minTickGap={24}
          />
          <YAxis
            stroke={VIZ_CHROME.axis}
            tick={{ fill: VIZ_COLOR.textTertiary, fontSize: VIZ_FONT.tickSize, fontFamily: VIZ_FONT.numeric }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={fmt}
            tickCount={5}
            domain={yDomain ?? ['auto', 'auto']}
          />

          {benchmark ? (
            <ReferenceLine
              y={benchmark.value}
              stroke={VIZ_CHROME.benchmark}
              strokeDasharray="5 4"
              strokeWidth={1.25}
              label={
                benchmark.label
                  ? {
                      value: benchmark.label,
                      position: 'insideTopRight',
                      fill: VIZ_COLOR.textTertiary,
                      fontSize: 11,
                      fontFamily: VIZ_FONT.numeric,
                    }
                  : undefined
              }
            />
          ) : null}

          <Tooltip
            cursor={{ stroke: VIZ_CHROME.grid, strokeWidth: 1 }}
            content={makeChartTooltip({ valueFormatter: (v) => fmt(Number(v)) })}
          />

          {variant === 'area' ? (
            <Area
              type="monotone"
              dataKey="y"
              name="Value"
              stroke={VIZ_COLOR.accent}
              strokeWidth={2}
              fill={`url(#${VIZ_DEFS.areaGradient})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: VIZ_COLOR.accent }}
              isAnimationActive
              animationDuration={VIZ_REVEAL_MS}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="y"
              name="Value"
              stroke={VIZ_COLOR.accent}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: VIZ_COLOR.accent }}
              isAnimationActive
              animationDuration={VIZ_REVEAL_MS}
            />
          )}

          {markers.map((m, i) => (
            <ReferenceDot
              key={i}
              x={m.x}
              y={m.y}
              r={4}
              fill={VIZ_COLOR.surface}
              stroke={m.marker?.tone ? MARKER_TONE_COLOR[m.marker.tone] : VIZ_COLOR.accent}
              strokeWidth={2}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* BarCompare — horizontal category comparison (vs benchmark) (§5.2)          */
/* -------------------------------------------------------------------------- */

import { Bar, BarChart, Cell } from 'recharts';

export interface BarCompareDatum {
  label: string;
  value: number;
  /** optional per-bar highlight (e.g. the selected metric) */
  highlight?: boolean;
}

export interface BarCompareProps {
  title: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  data: BarCompareDatum[];
  benchmark?: { value: number; label?: string };
  valueFormatter?: (value: number) => string;
  /** Serializable formatting mode for Server Component callers (functions
   *  can't cross the RSC boundary): 'signed' renders +N for positives. Ignored
   *  when valueFormatter is provided. */
  valueFormat?: 'signed';
  height?: number;
  state?: ChartFrameState;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Horizontal bar comparison on the warm palette: recessive warm-neutral bars
 * with the green accent spent only on the highlighted bar; optional dashed
 * benchmark line. Bars encode by length (color is never the only channel).
 */
export function BarCompare({
  title,
  overline,
  subtitle,
  takeaway,
  data,
  benchmark,
  valueFormatter,
  valueFormat,
  height = 240,
  state,
  actions,
  className,
}: BarCompareProps) {
  const fmt = React.useCallback(
    (v: number) => {
      if (valueFormatter) return valueFormatter(v);
      if (valueFormat === 'signed' && v > 0) return `+${v}`;
      return String(v);
    },
    [valueFormatter, valueFormat],
  );
  const resolvedState: ChartFrameState = state ?? (data.length === 0 ? 'empty' : 'ready');

  const tableData: ChartTableData = {
    caption: typeof title === 'string' ? title : 'Comparison data',
    columns: [
      { key: 'label', label: 'Category' },
      { key: 'value', label: 'Value', numeric: true },
    ],
    rows: data.map((d) => ({ label: d.label, value: fmt(d.value) })),
  };

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
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          barCategoryGap="28%"
        >
          <CartesianGrid stroke={VIZ_CHROME.grid} horizontal={false} vertical />
          <XAxis
            type="number"
            stroke={VIZ_CHROME.axis}
            tick={{ fill: VIZ_COLOR.textTertiary, fontSize: VIZ_FONT.tickSize, fontFamily: VIZ_FONT.numeric }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmt}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke={VIZ_CHROME.axis}
            tick={{ fill: VIZ_COLOR.textSecondary, fontSize: VIZ_FONT.labelSize, fontFamily: VIZ_FONT.numeric }}
            tickLine={false}
            axisLine={false}
            width={96}
          />
          {benchmark ? (
            <ReferenceLine
              x={benchmark.value}
              stroke={VIZ_CHROME.benchmark}
              strokeDasharray="5 4"
              strokeWidth={1.25}
            />
          ) : null}
          <Tooltip
            cursor={{ fill: 'var(--fw-color-accent-50)', opacity: 0.5 }}
            content={makeChartTooltip({ valueFormatter: (v) => fmt(Number(v)) })}
          />
          <Bar dataKey="value" name="Value" radius={[0, 6, 6, 0]} isAnimationActive animationDuration={VIZ_REVEAL_MS}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.highlight ? VIZ_COLOR.accent : 'var(--fw-color-warm-300)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
