'use client';

/**
 * ============================================================================
 * LeakMap — the canonical "you vs PGA" dot-and-curve leak chart (§5 / §1b)
 * ----------------------------------------------------------------------------
 * visx-based, wrapped in `ChartFrame` (matte cream card, "view as table"
 * toggle, honest empty states), mirroring `StrokesGainedTornado`'s token +
 * a11y patterns. The hero finding it exists to surface is the putting cliff
 * (e.g. 10-15 ft well below Tour) and the approach-proximity gap.
 *
 * Two ordinal curves over distance buckets (scaleBand x, scaleLinear y):
 *   - the PGA reference curve  → dashed warm benchmark line + hollow dots
 *   - the player/team curve    → solid line + filled dots, each dot tinted
 *     green when on the GOOD side of PGA and amber when on the WRONG side
 *
 * Dual-channel encoding (never color alone): the gap is also drawn as a
 * vertical connector between the two curve points, and the table fallback
 * lists Bucket / You / PGA / Δ / n exactly. Buckets with `sampleN === 0`
 * draw only the PGA reference point (no fake zero for the player).
 *
 * SHARED: consumed by FairwayPlayerStats (single player) and FairwayTeamStats
 * (team aggregate + per-player drill-down). It is data-source agnostic — the
 * caller maps its leak buckets onto `LeakMapBucket`.
 * ========================================================================== */

import * as React from 'react';
import { Group } from '@visx/group';
import { Circle, Line, LinePath } from '@visx/shape';
import { scaleBand, scaleLinear } from '@visx/scale';
import { ParentSize } from '@visx/responsive';
import {
  ChartFrame,
  type ChartFrameState,
  type ChartTableData,
} from './ChartFrame';
import { VIZ_CHROME, VIZ_COLOR, VIZ_DIVERGING, VIZ_FONT } from './theme';

export interface LeakMapBucket {
  /** Distance band label, e.g. '10-15 ft' / '125-175 yd'. */
  label: string;
  /** The player's (or team's) value: make% (percent) or proximity (feet). Null when no sample. */
  teamValue: number | null;
  /** PGA reference for the band; null where no standard exists (e.g. 0-3 ft). */
  pgaValue: number | null;
  /** Attempts / shots in the band. 0 → omit the player dot (draw PGA only). */
  sampleN: number;
}

export interface LeakMapProps {
  title?: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  data: LeakMapBucket[];
  /**
   * Drives which side of the PGA curve counts as the leak:
   *   - 'higher_better' (putting make%) → team BELOW PGA is the leak (amber).
   *   - 'lower_better'  (approach proximity) → team ABOVE PGA is the leak.
   */
  direction: 'higher_better' | 'lower_better';
  /** Display unit for value formatting + table. */
  unit: 'percent' | 'feet';
  /** Plot height in px (forwarded to ChartFrame). */
  height?: number;
  /** Explicit state override for honest empties. Auto-derived when omitted. */
  state?: ChartFrameState;
  /** Optional copy overriding the default empty/insufficient/error message. */
  stateMessage?: string;
  /** Right-aligned action cluster forwarded to ChartFrame. */
  actions?: React.ReactNode;
  className?: string;
}

const MARGIN = { top: 16, right: 16, bottom: 30, left: 44 };

/** Unit-aware value formatter (tabular-friendly, no trailing noise). */
function fmt(value: number, unit: LeakMapProps['unit']): string {
  return unit === 'percent' ? `${Math.round(value)}%` : `${Math.round(value)} ft`;
}

/** Signed delta of player vs PGA, oriented so + always reads as "better". */
function deltaText(
  teamValue: number | null,
  pgaValue: number | null,
  direction: LeakMapProps['direction'],
  unit: LeakMapProps['unit'],
): string {
  if (teamValue === null || pgaValue === null) return '—';
  const raw = teamValue - pgaValue;
  const oriented = direction === 'higher_better' ? raw : -raw;
  const mag = Math.abs(Math.round(raw));
  const suffix = unit === 'percent' ? 'pp' : ' ft';
  const sign = oriented > 0 ? '+' : oriented < 0 ? '−' : '';
  return `${sign}${mag}${suffix}`;
}

/** Is the player on the WRONG side of PGA for this band? (drives amber tint) */
function isLeak(
  teamValue: number | null,
  pgaValue: number | null,
  direction: LeakMapProps['direction'],
): boolean {
  if (teamValue === null || pgaValue === null) return false;
  return direction === 'higher_better' ? teamValue < pgaValue : teamValue > pgaValue;
}

export function LeakMap({
  title = 'Leak Map',
  overline,
  subtitle,
  takeaway,
  data,
  direction,
  unit,
  height = 260,
  state,
  actions,
  className,
}: LeakMapProps) {
  const hasAnySample = data.some((d) => d.sampleN > 0);
  const resolvedState: ChartFrameState =
    state ?? (data.length === 0 || !hasAnySample ? 'insufficient-data' : 'ready');

  const tableData: ChartTableData = {
    caption: `${typeof title === 'string' ? title : 'Leak map'} by distance vs PGA Tour`,
    columns: [
      { key: 'label', label: 'Distance' },
      { key: 'you', label: unit === 'percent' ? 'You' : 'You (ft)', numeric: true },
      { key: 'pga', label: 'PGA Tour', numeric: true },
      { key: 'delta', label: 'Δ', numeric: true },
      { key: 'n', label: 'Shots', numeric: true },
    ],
    rows: data.map((d) => ({
      label: d.label,
      you: d.teamValue === null ? '—' : fmt(d.teamValue, unit),
      pga: d.pgaValue === null ? '—' : fmt(d.pgaValue, unit),
      delta: deltaText(d.teamValue, d.pgaValue, direction, unit),
      n: d.sampleN,
    })),
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
            <LeakMapInner
              width={width}
              height={h}
              data={data}
              direction={direction}
              unit={unit}
            />
          ) : null
        }
      </ParentSize>
    </ChartFrame>
  );
}

function LeakMapInner({
  width,
  height,
  data,
  direction,
  unit,
}: {
  width: number;
  height: number;
  data: LeakMapBucket[];
  direction: LeakMapProps['direction'];
  unit: LeakMapProps['unit'];
}) {
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const xScale = React.useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, innerW],
        padding: 0.5,
      }),
    [data, innerW],
  );

  const yMax = React.useMemo(() => {
    const peak = data.reduce((m, d) => {
      const a = d.teamValue ?? 0;
      const b = d.pgaValue ?? 0;
      return Math.max(m, a, b);
    }, 0);
    // Percent caps at 100; feet gets headroom above the worst proximity.
    if (unit === 'percent') return Math.max(20, Math.min(100, peak * 1.15));
    return Math.max(10, peak * 1.15);
  }, [data, unit]);

  const yScale = React.useMemo(
    () => scaleLinear<number>({ domain: [0, yMax], range: [innerH, 0], nice: true }),
    [yMax, innerH],
  );

  const cx = (label: string) => (xScale(label) ?? 0) + xScale.bandwidth() / 2;

  // PGA curve points (only bands that have a standard).
  const pgaPoints = data
    .filter((d) => d.pgaValue !== null)
    .map((d) => ({ x: cx(d.label), y: yScale(d.pgaValue as number) }));

  // Player/team curve points (only bands with a sample).
  const teamPoints = data
    .filter((d) => d.teamValue !== null && d.sampleN > 0)
    .map((d) => ({ x: cx(d.label), y: yScale(d.teamValue as number) }));

  return (
    <svg width={width} height={height} aria-hidden>
      <Group left={MARGIN.left} top={MARGIN.top}>
        {/* y gridlines + tick labels — sparse, calm */}
        {yScale.ticks(4).map((t) => (
          <g key={t}>
            <Line
              from={{ x: 0, y: yScale(t) }}
              to={{ x: innerW, y: yScale(t) }}
              stroke={VIZ_CHROME.grid}
              strokeWidth={1}
            />
            <text
              x={-8}
              y={yScale(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize={VIZ_FONT.tickSize}
              fontFamily={VIZ_FONT.numeric}
              fill={VIZ_COLOR.textTertiary}
            >
              {Math.round(t)}
            </text>
          </g>
        ))}

        {/* x band labels */}
        {data.map((d) => (
          <text
            key={d.label}
            x={cx(d.label)}
            y={innerH + 18}
            textAnchor="middle"
            fontSize={VIZ_FONT.tickSize}
            fontFamily={VIZ_FONT.numeric}
            fill={VIZ_COLOR.textSecondary}
          >
            {d.label}
          </text>
        ))}

        {/* per-band gap connector (dual-channel: length encodes the leak) */}
        {data.map((d) => {
          if (d.teamValue === null || d.pgaValue === null || d.sampleN === 0) return null;
          const x = cx(d.label);
          const leak = isLeak(d.teamValue, d.pgaValue, direction);
          return (
            <Line
              key={`gap-${d.label}`}
              from={{ x, y: yScale(d.teamValue) }}
              to={{ x, y: yScale(d.pgaValue) }}
              stroke={leak ? VIZ_DIVERGING.negative : VIZ_DIVERGING.positive}
              strokeWidth={2}
              strokeOpacity={0.45}
            />
          );
        })}

        {/* PGA reference curve — dashed warm benchmark line + hollow dots */}
        {pgaPoints.length > 1 ? (
          <LinePath
            data={pgaPoints}
            x={(p) => p.x}
            y={(p) => p.y}
            stroke={VIZ_CHROME.benchmark}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        ) : null}
        {data.map((d) =>
          d.pgaValue === null ? null : (
            <Circle
              key={`pga-${d.label}`}
              cx={cx(d.label)}
              cy={yScale(d.pgaValue)}
              r={3.5}
              fill={VIZ_COLOR.surface}
              stroke={VIZ_CHROME.benchmark}
              strokeWidth={1.5}
            />
          ),
        )}

        {/* Player/team curve — solid line + filled dots tinted by leak side */}
        {teamPoints.length > 1 ? (
          <LinePath
            data={teamPoints}
            x={(p) => p.x}
            y={(p) => p.y}
            stroke={VIZ_COLOR.accent}
            strokeWidth={2}
          />
        ) : null}
        {data.map((d) => {
          if (d.teamValue === null || d.sampleN === 0) return null;
          const leak = isLeak(d.teamValue, d.pgaValue, direction);
          const fill = leak ? VIZ_DIVERGING.negative : VIZ_DIVERGING.positive;
          return (
            <g key={`you-${d.label}`}>
              <Circle cx={cx(d.label)} cy={yScale(d.teamValue)} r={5} fill={fill} />
              {/* value annotation above the player dot */}
              <text
                x={cx(d.label)}
                y={yScale(d.teamValue) - 9}
                textAnchor="middle"
                fontSize={VIZ_FONT.tickSize}
                fontFamily={VIZ_FONT.numeric}
                fontWeight={600}
                fill={VIZ_COLOR.textPrimary}
              >
                {fmt(d.teamValue, unit)}
              </text>
            </g>
          );
        })}
      </Group>
    </svg>
  );
}
