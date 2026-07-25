'use client';

/**
 * ============================================================================
 * GenomeRadar — the single-series "hero shape" glance (§5.2 Genome row)
 * ----------------------------------------------------------------------------
 * The spec allows ONE small decorative radar as a hero "shape" glance — a
 * single green series on a shared 0–100 percentile scale, with tooltips. It is
 * NOT the comparison surface (compare two players via overlaid diverging bars,
 * never two radars). Strictly one series here by design.
 *
 * Matte ChartFrame; the only glass is the tooltip. Calm: faint warm polar grid,
 * tertiary spoke labels, the green spent on the single fingerprint shape.
 * ========================================================================== */

import * as React from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  ChartFrame,
  type ChartFrameState,
  type ChartTableData,
} from './ChartFrame';
import { makeChartTooltip } from './ChartTooltip';
import { VIZ_CHROME, VIZ_COLOR, VIZ_REVEAL_MS, VIZ_FONT } from './theme';

export interface GenomeAxis {
  /** dimension name, e.g. "Driving", "Approach", "Putting", "Around Green" */
  label: string;
  /** percentile / score on the shared 0–100 scale */
  value: number;
}

export interface GenomeRadarProps {
  title?: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  data: GenomeAxis[];
  /** series name shown in the tooltip */
  seriesName?: string;
  /** scale max (default 100 — percentile) */
  max?: number;
  height?: number;
  state?: ChartFrameState;
  actions?: React.ReactNode;
  className?: string;
}

export function GenomeRadar({
  title = 'Player Genome',
  overline,
  subtitle,
  takeaway,
  data,
  seriesName = 'Percentile',
  max = 100,
  height = 280,
  state,
  actions,
  className,
}: GenomeRadarProps) {
  const resolvedState: ChartFrameState = state ?? (data.length < 3 ? 'insufficient-data' : 'ready');

  const tableData: ChartTableData = {
    caption: 'Genome percentile by dimension',
    columns: [
      { key: 'label', label: 'Dimension' },
      { key: 'value', label: seriesName, numeric: true },
    ],
    rows: data.map((d) => ({ label: d.label, value: Math.round(d.value) })),
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
        <RadarChart
          data={data}
          outerRadius="56%"
          // Generous margin (NOT the outerRadius%) is what actually reserves the
          // label ring — recharts' maxRadius = min(width - L - R, height - T - B) / 2,
          // so shrinking the plot via margin (rather than clipping) leaves real
          // room for axis labels like "Back-9 stamina" / "Par-3 performance" to
          // sit fully inside the SVG instead of running off the edge.
          margin={{ top: 20, right: 28, bottom: 20, left: 28 }}
        >
          <PolarGrid stroke={VIZ_CHROME.grid} />
          <PolarAngleAxis
            dataKey="label"
            tick={{
              fill: VIZ_COLOR.textTertiary,
              fontSize: VIZ_FONT.tickSize,
              fontFamily: VIZ_FONT.numeric,
              // recharts' <Text> auto-wraps to as many lines as needed within
              // this width — no truncation/ellipsis, just real multi-line space
              // for long dimension labels ("Driver usage", "Par-3 performance").
              width: 62,
            }}
          />
          <PolarRadiusAxis
            domain={[0, max]}
            /* tickSize (11), not a hardcoded 10 — the radial axis was the one
               chart tick left under the 11px legibility floor (audit P-30). */
            tick={{ fill: VIZ_COLOR.textTertiary, fontSize: VIZ_FONT.tickSize, fontFamily: VIZ_FONT.numeric }}
            axisLine={false}
            tickCount={4}
          />
          <Tooltip
            content={makeChartTooltip({ valueFormatter: (v) => `${Math.round(Number(v))}` })}
          />
          <Radar
            name={seriesName}
            dataKey="value"
            stroke={VIZ_COLOR.accent}
            strokeWidth={2}
            fill={VIZ_COLOR.accent}
            fillOpacity={0.18}
            isAnimationActive
            animationDuration={VIZ_REVEAL_MS}
            dot={{ r: 2.5, fill: VIZ_COLOR.accent, strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
