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
  /** optional marker (e.g. a tournament) rendered as a ReferenceDot */
  marker?: { label?: string };
}

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
      <ResponsiveContainer width="100%" height="100%">
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
              stroke={VIZ_COLOR.accent}
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
  height = 240,
  state,
  actions,
  className,
}: BarCompareProps) {
  const fmt = React.useCallback(
    (v: number) => (valueFormatter ? valueFormatter(v) : String(v)),
    [valueFormatter],
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
      <ResponsiveContainer width="100%" height="100%">
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
