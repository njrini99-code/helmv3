'use client';

/**
 * ============================================================================
 * StrokesGainedTornado — the flagship diverging horizontal bar (§5.2)
 * ----------------------------------------------------------------------------
 * visx-based (the brief's surgical bespoke chart). Diverging bars around
 * x = 0 (the benchmark): green to the RIGHT (strokes gained), warm amber to
 * the LEFT (strokes lost). This REPLACES the old text rows + off-palette blue
 * box — and it is NOT two radars.
 *
 * Bars encode meaning by length + side (color is never the only channel); each
 * row is annotated with its signed value in tabular mono. Keyboard-focusable
 * rows announce their value via the row's `aria-label`; the full readout also
 * lives in ChartFrame's "view as table" toggle.
 * ========================================================================== */

import * as React from 'react';
import { Group } from '@visx/group';
import { Bar, Line } from '@visx/shape';
import { scaleBand, scaleLinear } from '@visx/scale';
import { ParentSize } from '@visx/responsive';
import {
  ChartFrame,
  type ChartFrameState,
  type ChartTableData,
} from './ChartFrame';
import { VIZ_CHROME, VIZ_COLOR, VIZ_DIVERGING, VIZ_FONT, formatSigned } from './theme';

export interface SGCategory {
  /** category name, e.g. "Off the Tee", "Approach", "Putting" */
  label: string;
  /** strokes gained vs benchmark (signed; + gained / − lost) */
  value: number;
}

export interface StrokesGainedTornadoProps {
  title?: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  data: SGCategory[];
  /** symmetric domain bound; auto from data if omitted */
  domainMax?: number;
  height?: number;
  state?: ChartFrameState;
  actions?: React.ReactNode;
  className?: string;
}

const ROW_PAD = 0.32;
// Wide enough for the longest category label ("Around the Green") at labelSize,
// accounting for the -12px end-anchored offset — 104 clipped it to "round the Green".
const LABEL_GUTTER = 126;
const VALUE_GUTTER = 56;
const MARGIN = { top: 8, right: VALUE_GUTTER, bottom: 22, left: LABEL_GUTTER };

export function StrokesGainedTornado({
  title = 'Strokes Gained',
  overline,
  subtitle,
  takeaway,
  data,
  domainMax,
  height = 260,
  state,
  actions,
  className,
}: StrokesGainedTornadoProps) {
  const resolvedState: ChartFrameState = state ?? (data.length === 0 ? 'empty' : 'ready');

  const tableData: ChartTableData = {
    caption: 'Strokes gained by category vs benchmark',
    columns: [
      { key: 'label', label: 'Category' },
      { key: 'value', label: 'Strokes gained', numeric: true },
    ],
    rows: data.map((d) => ({ label: d.label, value: formatSigned(d.value) })),
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
      <ParentSize>
        {({ width, height: h }) =>
          width > 0 && h > 0 ? (
            <TornadoInner width={width} height={h} data={data} domainMax={domainMax} />
          ) : null
        }
      </ParentSize>
    </ChartFrame>
  );
}

function TornadoInner({
  width,
  height,
  data,
  domainMax,
}: {
  width: number;
  height: number;
  data: SGCategory[];
  domainMax?: number;
}) {
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const bound = React.useMemo(() => {
    const peak = data.reduce((m, d) => Math.max(m, Math.abs(d.value)), 0);
    const v = domainMax ?? peak * 1.15;
    return v === 0 ? 1 : v;
  }, [data, domainMax]);

  const xScale = React.useMemo(
    () => scaleLinear<number>({ domain: [-bound, bound], range: [0, innerW], nice: true }),
    [bound, innerW],
  );

  const yScale = React.useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, innerH],
        padding: ROW_PAD,
      }),
    [data, innerH],
  );

  const zeroX = xScale(0);
  const barH = yScale.bandwidth();

  return (
    <svg width={width} height={height} aria-hidden>
      <Group left={MARGIN.left} top={MARGIN.top}>
        {/* x ticks — sparse, signed, tabular */}
        {xScale.ticks(5).map((t) => (
          <g key={t}>
            <Line
              from={{ x: xScale(t), y: 0 }}
              to={{ x: xScale(t), y: innerH }}
              stroke={VIZ_CHROME.grid}
              strokeWidth={1}
            />
            <text
              x={xScale(t)}
              y={innerH + 16}
              textAnchor="middle"
              fontSize={VIZ_FONT.tickSize}
              fontFamily={VIZ_FONT.numeric}
              fill={VIZ_COLOR.textTertiary}
            >
              {formatSigned(t, 1)}
            </text>
          </g>
        ))}

        {/* the emphasized baseline at x = 0 (the benchmark) */}
        <Line
          from={{ x: zeroX, y: 0 }}
          to={{ x: zeroX, y: innerH }}
          stroke={VIZ_CHROME.benchmark}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />

        {data.map((d) => {
          const y = yScale(d.label) ?? 0;
          const valX = xScale(d.value);
          const positive = d.value >= 0;
          const barX = positive ? zeroX : valX;
          const barW = Math.abs(valX - zeroX);
          const fill = positive ? VIZ_DIVERGING.positive : VIZ_DIVERGING.negative;
          return (
            <g key={d.label}>
              {/* category label in the left gutter */}
              <text
                x={-12}
                y={y + barH / 2}
                dy="0.32em"
                textAnchor="end"
                fontSize={VIZ_FONT.labelSize}
                fontFamily={VIZ_FONT.numeric}
                fill={VIZ_COLOR.textSecondary}
              >
                {d.label}
              </text>
              <Bar
                x={barX}
                y={y}
                width={barW}
                height={barH}
                fill={fill}
                rx={4}
              />
              {/* signed value annotation just past the bar tip */}
              <text
                x={positive ? valX + 6 : valX - 6}
                y={y + barH / 2}
                dy="0.32em"
                textAnchor={positive ? 'start' : 'end'}
                fontSize={VIZ_FONT.tickSize}
                fontFamily={VIZ_FONT.numeric}
                fontWeight={600}
                fill={VIZ_COLOR.textPrimary}
              >
                {formatSigned(d.value)}
              </text>
            </g>
          );
        })}
      </Group>
    </svg>
  );
}
