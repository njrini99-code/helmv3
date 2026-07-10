'use client';

// =============================================================================
// src/components/baseball/stat-visuals/HittingVisuals.tsx
//
// V10 baseball HITTING stat visuals, each mounted inside the Foundations
// <StatVisualFrame> (imported, not rebuilt) with source chips, sample size,
// honest confidence, context split, table fallback, insufficient-data gating,
// and chart-click into the source drawer.
//
// Charts in this file (v10_baseball_stat_visual_contracts.md §"Hitting Visuals"):
//   - EvLaContactMatrix     §"EV/LA Contact Quality Matrix" (scatter>=15, hexbin>=80)
//   - ZoneChaseDamageHeatmap §"Zone Chase And Damage Heatmap" (>=30)
//   - SprayChart            §"Spray Chart" (>=10 show / >=30 trend)
//   - ApproachCountLadder   §"Approach Count Ladder"
//   - GameVsPracticeGap     §"Game Vs Practice Contact Gap"
//
// NO golf labels. Cream/green only. SVG render (aggregate dense scatter to hexbin
// above threshold — keeps SVG node count low without a canvas dependency).
// =============================================================================

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  StatVisualFrame,
  type StatVisualSourceChip,
  type StatVisualTableData,
} from './StatVisualFrame';
import {
  useMeasuredWidth,
  PLOT_MARGIN,
  AxisX,
  AxisY,
  makeTicks,
  ChartLegend,
  TabStrip,
  ContextSplitFilter,
  BulletBar,
  type LegendItem,
} from './chart-primitives';
import {
  linearScale,
  niceDomain,
  gateSample,
  SAMPLE_THRESHOLDS,
  scatterRenderMode,
  hexbin,
  greenHeat,
  divergingHeat,
  pct,
  num,
  delta,
} from './chart-geometry';
import type {
  EvLaPoint,
  BattedBallOutcome,
  ZoneCell,
  ZoneMetric,
  SprayPoint,
  CountLadderRow,
  CountBucket,
  PairedMetricRow,
} from '@/lib/types/baseball-stat-visuals';
import type { BaseballDataContext } from '@/lib/types/baseball-stat-events';

// -----------------------------------------------------------------------------
// shared
// -----------------------------------------------------------------------------

const OUTCOME_COLOR: Record<BattedBallOutcome, string> = {
  hit: '#16A34A', // primary-600
  extra_base: '#15803d', // primary-700
  out: '#a8a29e', // warm-400
  hard_out: '#d97706', // amber-600
  soft_contact: '#e7e5e4', // warm-200
  unknown: '#d6d3d1', // warm-300
};

const OUTCOME_LABEL: Record<BattedBallOutcome, string> = {
  hit: 'Hit',
  extra_base: 'Extra-base',
  out: 'Out',
  hard_out: 'Hard-hit out',
  soft_contact: 'Soft contact',
  unknown: 'Unknown',
};

function uniqueContexts(contexts: BaseballDataContext[]): BaseballDataContext[] {
  return [...new Set(contexts)];
}

// =============================================================================
// EV / LA Contact Quality Matrix
// =============================================================================

export interface EvLaContactMatrixProps {
  points: EvLaPoint[];
  /** chart-level source chips (per-point provenance opens the drawer). */
  sources?: StatVisualSourceChip[];
  onPointActivate?: (ids: string[]) => void;
  height?: number;
  className?: string;
}

export function EvLaContactMatrix({
  points,
  sources,
  onPointActivate,
  height = 300,
  className,
}: EvLaContactMatrixProps) {
  const [ctx, setCtx] = React.useState<BaseballDataContext | null>(null);
  const [ref, width] = useMeasuredWidth();

  const allContexts = React.useMemo(
    () => uniqueContexts(points.map((p) => p.context)),
    [points],
  );

  // Only ever plot points with BOTH coords — never coerce a missing reading to 0.
  const valid = React.useMemo(
    () =>
      points.filter(
        (p) =>
          p.exitVelocity !== null &&
          p.launchAngle !== null &&
          (ctx === null || p.context === ctx),
      ),
    [points, ctx],
  );

  const gate = gateSample(valid.length, SAMPLE_THRESHOLDS.evLaMatrix);
  const mode = scatterRenderMode(valid.length, SAMPLE_THRESHOLDS.evLaMatrix);

  const domainX = niceDomain(valid.map((p) => p.exitVelocity), 0.05, [60, 110]);
  const domainY = niceDomain(valid.map((p) => p.launchAngle), 0.05, [-20, 50]);

  const innerW = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const innerH = Math.max(0, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const sx = linearScale(domainX, [PLOT_MARGIN.left, PLOT_MARGIN.left + innerW], true);
  const sy = linearScale(domainY, [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);

  const bins = React.useMemo(
    () =>
      mode === 'aggregate'
        ? hexbin(
            valid.map((p) => ({ id: p.id, x: p.exitVelocity, y: p.launchAngle })),
            domainX,
            domainY,
            16,
          )
        : [],
    [mode, valid, domainX, domainY],
  );
  const maxBin = bins.reduce((m, b) => Math.max(m, b.count), 0) || 1;

  const legend: LegendItem[] =
    mode === 'aggregate'
      ? [
          { key: 'low', label: 'Fewer balls', color: greenHeat(0.2) },
          { key: 'high', label: 'More balls', color: greenHeat(1) },
        ]
      : (Object.keys(OUTCOME_COLOR) as BattedBallOutcome[])
          .filter((o) => valid.some((p) => p.outcome === o))
          .map((o) => ({ key: o, label: OUTCOME_LABEL[o], color: OUTCOME_COLOR[o] }));

  const table: StatVisualTableData = {
    caption: 'Exit velocity, launch angle, batted-ball result, context and source per ball.',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'context', label: 'Context' },
      { key: 'pitch', label: 'Pitch' },
      { key: 'ev', label: 'EV', numeric: true },
      { key: 'la', label: 'LA', numeric: true },
      { key: 'type', label: 'Type' },
      { key: 'result', label: 'Result' },
    ],
    rows: valid.map((p) => ({
      date: p.date ?? '—',
      context: p.context,
      pitch: p.pitchType ?? '—',
      ev: num(p.exitVelocity, 1),
      la: num(p.launchAngle, 1),
      type: p.battedBallType ?? '—',
      result: OUTCOME_LABEL[p.outcome],
    })),
  };

  return (
    <StatVisualFrame
      title="Contact quality — EV / LA"
      subtitle="Dangerous contact, or empty contact?"
      takeaway={
        gate.canRead
          ? `${valid.length} batted balls plotted`
          : 'Not enough batted balls for a reliable read'
      }
      overline="Hitting"
      sources={sources}
      dataContexts={ctx ? [ctx] : allContexts}
      sample={{
        size: valid.length,
        unitLabel: 'batted balls',
        confidence: gate.confidence,
        minForRead: SAMPLE_THRESHOLDS.evLaMatrix.read,
      }}
      tableData={table}
      height={height}
      className={className}
      actions={
        <ContextSplitFilter available={allContexts} value={ctx} onChange={setCtx} />
      }
    >
      <div ref={ref} className="flex h-full flex-col">
        <svg width={width} height={height} className="overflow-visible" role="presentation">
          {/* gridlines at sweet-spot LA band 10-30 */}
          <rect
            x={PLOT_MARGIN.left}
            y={sy(30)}
            width={innerW}
            height={Math.abs(sy(10) - sy(30))}
            className="fill-primary-50/50"
          />
          <AxisX
            y={PLOT_MARGIN.top + innerH}
            x0={PLOT_MARGIN.left}
            x1={PLOT_MARGIN.left + innerW}
            ticks={makeTicks(domainX[0], domainX[1], sx, 5)}
            format={(v) => v.toFixed(0)}
            label="Exit velo (mph)"
          />
          <AxisY
            x={PLOT_MARGIN.left}
            y0={PLOT_MARGIN.top + innerH}
            y1={PLOT_MARGIN.top}
            ticks={makeTicks(domainY[0], domainY[1], sy, 5)}
            format={(v) => v.toFixed(0)}
            label="Launch angle"
          />

          {mode === 'aggregate'
            ? bins.map((b, i) => {
                const r = 4 + (b.count / maxBin) * 9;
                return (
                  <circle
                    key={i}
                    cx={sx(b.cx)}
                    cy={sy(b.cy)}
                    r={r}
                    fill={greenHeat(0.25 + (b.count / maxBin) * 0.75)}
                    fillOpacity={0.85}
                    stroke="white"
                    strokeWidth={0.5}
                    className={
                      onPointActivate
                        ? 'cursor-pointer transition-[stroke] duration-150 hover:stroke-warm-900'
                        : undefined
                    }
                    onClick={onPointActivate ? () => onPointActivate(b.ids) : undefined}
                  >
                    <title>{`${b.count} balls`}</title>
                  </circle>
                );
              })
            : valid.map((p) => (
                <circle
                  key={p.id}
                  cx={sx(p.exitVelocity as number)}
                  cy={sy(p.launchAngle as number)}
                  r={4}
                  fill={OUTCOME_COLOR[p.outcome]}
                  fillOpacity={0.85}
                  stroke="white"
                  strokeWidth={0.5}
                  className={
                    p.source && onPointActivate
                      ? 'cursor-pointer transition-[stroke] duration-150 hover:stroke-warm-900'
                      : undefined
                  }
                  onClick={
                    onPointActivate && p.source ? () => onPointActivate([p.id]) : undefined
                  }
                >
                  <title>{`${OUTCOME_LABEL[p.outcome]} · ${num(p.exitVelocity, 0)} mph · ${num(p.launchAngle, 0)}°`}</title>
                </circle>
              ))}
        </svg>
        <ChartLegend items={legend} className="mt-1 px-1" />
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Zone Chase / Damage Heatmap
// =============================================================================

const ZONE_METRIC_LABEL: Record<ZoneMetric, string> = {
  chase: 'Chase rate',
  whiff: 'Whiff rate',
  damage: 'Damage',
  take_correct: 'Take correctness',
  two_strike_chase: 'Two-strike chase',
  command: 'Location density',
};

export interface ZoneChaseDamageHeatmapProps {
  /** cells keyed by zoneId: 1-9 in-zone + chase_tl/tr/bl/br outer quadrants. */
  cells: ZoneCell[];
  totalPitches: number;
  metric: ZoneMetric;
  onMetricChange?: (m: ZoneMetric) => void;
  availableMetrics?: ZoneMetric[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function ZoneChaseDamageHeatmap({
  cells,
  totalPitches,
  metric,
  onMetricChange,
  availableMetrics = ['chase', 'whiff', 'damage', 'take_correct', 'two_strike_chase'],
  sources,
  height = 320,
  className,
}: ZoneChaseDamageHeatmapProps) {
  const gate = gateSample(totalPitches, SAMPLE_THRESHOLDS.zoneHeatmap);
  const byId = React.useMemo(() => new Map(cells.map((c) => [c.zoneId, c])), [cells]);
  const heat = metric === 'damage' ? divergingHeat : greenHeat;

  const cell = (id: string) => byId.get(id);
  const rate = (id: string) => cell(id)?.rate ?? null;

  // 3x3 in-zone grid + 4 chase quadrants drawn as a 5x5 frame.
  const grid = 5;
  const size = Math.min(height - 28, 280);
  const unit = size / grid;

  const table: StatVisualTableData = {
    caption: 'Per-zone pitch count, active-metric rate, and secondary count.',
    columns: [
      { key: 'zone', label: 'Zone' },
      { key: 'pitches', label: 'Pitches', numeric: true },
      { key: 'rate', label: ZONE_METRIC_LABEL[metric], numeric: true },
      { key: 'secondary', label: 'Hard/Swings', numeric: true },
    ],
    rows: cells.map((c) => ({
      zone: c.zoneId,
      pitches: c.pitches,
      rate: pct(c.rate, 0),
      secondary: c.secondary ?? '—',
    })),
  };

  // map zoneId -> grid coords. in-zone 1-9 -> inner 3x3 (rows 1..3, cols 1..3)
  function coordsFor(id: string): { col: number; row: number; span: number } | null {
    const n = Number(id);
    if (n >= 1 && n <= 9) {
      const r = Math.floor((n - 1) / 3);
      const c = (n - 1) % 3;
      return { col: 1 + c, row: 1 + r, span: 1 };
    }
    switch (id) {
      case 'chase_tl':
        return { col: 0, row: 0, span: 1 };
      case 'chase_tr':
        return { col: 4, row: 0, span: 1 };
      case 'chase_bl':
        return { col: 0, row: 4, span: 1 };
      case 'chase_br':
        return { col: 4, row: 4, span: 1 };
      default:
        return null;
    }
  }

  return (
    <StatVisualFrame
      title="Strike zone — chase & damage"
      subtitle="Where the hitter expands, and where damage comes from."
      overline="Hitting"
      takeaway={gate.canRead ? `${ZONE_METRIC_LABEL[metric]} across the zone` : undefined}
      sources={sources}
      sample={{
        size: totalPitches,
        unitLabel: 'pitches seen',
        confidence: gate.confidence,
        minForRead: SAMPLE_THRESHOLDS.zoneHeatmap.read,
      }}
      tableData={table}
      height={height}
      className={className}
      actions={
        onMetricChange ? (
          <TabStrip
            ariaLabel="Zone metric"
            value={metric}
            onChange={onMetricChange}
            options={availableMetrics.map((m) => ({ value: m, label: ZONE_METRIC_LABEL[m] }))}
          />
        ) : undefined
      }
    >
      <div className="flex h-full items-center justify-center">
        <svg width={size} height={size} role="presentation">
          {/* outer chase region tint */}
          <rect x={0} y={0} width={size} height={size} className="fill-warm-50" rx={8} />
          {/* strike-zone outline (inner 3x3) */}
          <rect
            x={unit}
            y={unit}
            width={unit * 3}
            height={unit * 3}
            fill="none"
            stroke="var(--color-warm-400, #a8a29e)"
            strokeWidth={1.5}
          />
          {cells.map((c) => {
            const co = coordsFor(c.zoneId);
            if (!co) return null;
            const r = rate(c.zoneId);
            return (
              <g key={c.zoneId}>
                <rect
                  x={co.col * unit + 1}
                  y={co.row * unit + 1}
                  width={unit - 2}
                  height={unit - 2}
                  rx={3}
                  fill={r === null ? '#f5f5f4' : heat(r)}
                  stroke="white"
                  strokeWidth={1}
                />
                <text
                  x={co.col * unit + unit / 2}
                  y={co.row * unit + unit / 2 + 4}
                  textAnchor="middle"
                  className={cn(
                    'text-micro font-semibold tabular-nums',
                    r !== null && r > 0.5 ? 'fill-white' : 'fill-warm-700',
                  )}
                >
                  {r === null ? '—' : pct(r, 0)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Spray Chart
// =============================================================================

export interface SprayChartProps {
  points: SprayPoint[];
  /** batter handedness flips the field orientation label only. */
  handedness?: 'L' | 'R' | null;
  sources?: StatVisualSourceChip[];
  onPointActivate?: (ids: string[]) => void;
  height?: number;
  className?: string;
}

export function SprayChart({
  points,
  sources,
  onPointActivate,
  height = 320,
  className,
}: SprayChartProps) {
  const [ctx, setCtx] = React.useState<BaseballDataContext | null>(null);
  const allContexts = React.useMemo(
    () => uniqueContexts(points.map((p) => p.context)),
    [points],
  );
  const valid = React.useMemo(
    () => points.filter((p) => p.sprayAngle !== null && (ctx === null || p.context === ctx)),
    [points, ctx],
  );
  const gate = gateSample(valid.length, SAMPLE_THRESHOLDS.spray);

  const size = Math.min(height - 28, 300);
  const cx = size / 2;
  const cy = size - 16;
  const maxR = size - 40;
  const maxDist = Math.max(330, ...valid.map((p) => p.distance ?? 0));

  // spray angle -45 (LF line) .. +45 (RF line). distance -> radius.
  function place(p: SprayPoint): { x: number; y: number } {
    const ang = ((p.sprayAngle as number) * Math.PI) / 180; // -.785..+.785
    const rNorm = p.distance !== null ? Math.min(1, p.distance / maxDist) : 0.55;
    const r = rNorm * maxR;
    return { x: cx + Math.sin(ang) * r, y: cy - Math.cos(ang) * r };
  }

  const legend: LegendItem[] = (Object.keys(OUTCOME_COLOR) as BattedBallOutcome[])
    .filter((o) => valid.some((p) => p.outcome === o))
    .map((o) => ({ key: o, label: OUTCOME_LABEL[o], color: OUTCOME_COLOR[o] }));

  const table: StatVisualTableData = {
    caption: 'Per-ball spray angle, distance, exit velocity, type, result and context.',
    columns: [
      { key: 'angle', label: 'Spray°', numeric: true },
      { key: 'dist', label: 'Dist (ft)', numeric: true },
      { key: 'ev', label: 'EV', numeric: true },
      { key: 'type', label: 'Type' },
      { key: 'result', label: 'Result' },
      { key: 'context', label: 'Context' },
    ],
    rows: valid.map((p) => ({
      angle: num(p.sprayAngle, 0),
      dist: p.distance === null ? '—' : num(p.distance, 0),
      ev: num(p.exitVelocity, 0),
      type: p.battedBallType ?? '—',
      result: OUTCOME_LABEL[p.outcome],
      context: p.context,
    })),
  };

  return (
    <StatVisualFrame
      title="Spray chart"
      subtitle="Is the hitter using the field?"
      overline="Hitting"
      takeaway={
        gate.canTrend
          ? `${valid.length} balls — trend reliable`
          : gate.canRead
            ? `${valid.length} balls — directional, not a trend`
            : undefined
      }
      sources={sources}
      dataContexts={ctx ? [ctx] : allContexts}
      sample={{
        size: valid.length,
        unitLabel: 'batted balls',
        confidence: gate.confidence,
        minForRead: SAMPLE_THRESHOLDS.spray.read,
      }}
      lowConfidenceCaveat={
        gate.canRead && !gate.canTrend
          ? 'Below the trend threshold — read these as examples, not a directional trend.'
          : undefined
      }
      tableData={table}
      height={height}
      className={className}
      actions={<ContextSplitFilter available={allContexts} value={ctx} onChange={setCtx} />}
    >
      <div className="flex h-full items-center justify-center">
        <svg width={size} height={size} role="presentation">
          {/* outfield arc + foul lines */}
          <path
            d={`M ${cx} ${cy} L ${cx + Math.sin(-0.785) * maxR} ${cy - Math.cos(-0.785) * maxR} A ${maxR} ${maxR} 0 0 1 ${cx + Math.sin(0.785) * maxR} ${cy - Math.cos(0.785) * maxR} Z`}
            className="fill-primary-50/60 stroke-warm-300"
            strokeWidth={1}
          />
          {/* infield diamond hint */}
          <polygon
            points={`${cx},${cy} ${cx + 26},${cy - 26} ${cx},${cy - 52} ${cx - 26},${cy - 26}`}
            className="fill-warm-100 stroke-warm-300"
            strokeWidth={1}
          />
          {valid.map((p) => {
            const { x, y } = place(p);
            const r = p.exitVelocity ? 3 + Math.min(5, (p.exitVelocity - 70) / 8) : 3;
            return (
              <circle
                key={p.id}
                cx={x}
                cy={y}
                r={Math.max(2.5, r)}
                fill={OUTCOME_COLOR[p.outcome]}
                fillOpacity={0.85}
                stroke="white"
                strokeWidth={0.5}
                className={
                  p.source && onPointActivate
                    ? 'cursor-pointer transition-[stroke] duration-150 hover:stroke-warm-900'
                    : undefined
                }
                onClick={onPointActivate && p.source ? () => onPointActivate([p.id]) : undefined}
              >
                <title>{`${OUTCOME_LABEL[p.outcome]} · ${num(p.distance, 0)} ft`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
      <ChartLegend items={legend} className="mt-1 justify-center" />
    </StatVisualFrame>
  );
}

// =============================================================================
// Approach Count Ladder
// =============================================================================

const COUNT_BUCKET_LABEL: Record<CountBucket, string> = {
  first_pitch: '0-0 (first pitch)',
  hitter_ahead: 'Hitter ahead',
  even: 'Even',
  pitcher_ahead: 'Pitcher ahead',
  two_strike: 'Two-strike',
};

export interface ApproachCountLadderProps {
  rows: CountLadderRow[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function ApproachCountLadder({
  rows,
  sources,
  height = 300,
  className,
}: ApproachCountLadderProps) {
  const total = rows.reduce((s, r) => s + r.pitches, 0);
  const gate = gateSample(total, { read: 20, trend: 60 });

  const table: StatVisualTableData = {
    caption: 'Per-count swing, chase, whiff, hard-hit rates and outcome.',
    columns: [
      { key: 'bucket', label: 'Count' },
      { key: 'pitches', label: 'Pitches', numeric: true },
      { key: 'swing', label: 'Swing%', numeric: true },
      { key: 'chase', label: 'Chase%', numeric: true },
      { key: 'whiff', label: 'Whiff%', numeric: true },
      { key: 'hard', label: 'Hard%', numeric: true },
      { key: 'outcome', label: 'Outcome' },
    ],
    rows: rows.map((r) => ({
      bucket: COUNT_BUCKET_LABEL[r.bucket],
      pitches: r.pitches,
      swing: pct(r.swingRate, 0),
      chase: pct(r.chaseRate, 0),
      whiff: pct(r.whiffRate, 0),
      hard: pct(r.hardHitRate, 0),
      outcome: r.outcomeLabel ?? '—',
    })),
  };

  return (
    <StatVisualFrame
      title="Approach by count"
      subtitle="Does the hitter change approach by count usefully?"
      overline="Hitting"
      sources={sources}
      sample={{ size: total, unitLabel: 'pitches', confidence: gate.confidence, minForRead: 20 }}
      tableData={table}
      height={height}
      className={className}
    >
      <div className="flex h-full flex-col justify-center gap-2.5">
        {rows.map((r) => (
          <div key={r.bucket} className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
            <span className="truncate text-xs font-medium text-warm-700">
              {COUNT_BUCKET_LABEL[r.bucket]}
            </span>
            <div className="grid grid-cols-3 gap-2">
              <LadderMetric label="Swing" rate={r.swingRate} tone="primary" />
              <LadderMetric label="Chase" rate={r.chaseRate} tone="amber" />
              <LadderMetric label="Hard" rate={r.hardHitRate} tone="primary" />
            </div>
            <span className="w-16 text-right text-xs tabular-nums text-warm-500">
              {r.pitches} P
            </span>
          </div>
        ))}
      </div>
    </StatVisualFrame>
  );
}

function LadderMetric({
  label,
  rate,
  tone,
}: {
  label: string;
  rate: number | null;
  tone: 'primary' | 'amber';
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-9 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
        {label}
      </span>
      <BulletBar value={rate} max={1} tone={tone} />
      <span className="w-9 text-right text-micro tabular-nums text-warm-600">{pct(rate, 0)}</span>
    </div>
  );
}

// =============================================================================
// Game vs Practice Contact Gap (paired bullets)
// =============================================================================

export interface GameVsPracticeGapProps {
  rows: PairedMetricRow[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function GameVsPracticeGap({
  rows,
  sources,
  height = 320,
  className,
}: GameVsPracticeGapProps) {
  const minGameSample = Math.min(...rows.map((r) => r.gameSample), Infinity);
  const totalGame = rows.reduce((s, r) => s + r.gameSample, 0);
  const gate = gateSample(totalGame, { read: 10, trend: 40 });

  const table: StatVisualTableData = {
    caption: 'Game vs practice value, sample size, and the translation gap per metric.',
    columns: [
      { key: 'metric', label: 'Metric' },
      { key: 'game', label: 'Game', numeric: true },
      { key: 'gameN', label: 'Game N', numeric: true },
      { key: 'practice', label: 'Practice', numeric: true },
      { key: 'practiceN', label: 'Prac. N', numeric: true },
      { key: 'gap', label: 'Gap', numeric: true },
    ],
    rows: rows.map((r) => ({
      metric: r.label,
      game: r.gameValue === null ? '—' : `${num(r.gameValue, 1)}${r.unit ?? ''}`,
      gameN: r.gameSample,
      practice: r.practiceValue === null ? '—' : `${num(r.practiceValue, 1)}${r.unit ?? ''}`,
      practiceN: r.practiceSample,
      gap: delta(r.gameValue, r.practiceValue).text,
    })),
  };

  return (
    <StatVisualFrame
      title="Game vs practice contact gap"
      subtitle="Is cage performance translating to games?"
      overline="Hitting"
      sources={sources}
      dataContexts={['official_game', 'practice']}
      sample={{
        size: totalGame,
        unitLabel: 'game samples',
        confidence: gate.confidence,
        minForRead: 10,
      }}
      lowConfidenceCaveat={
        Number.isFinite(minGameSample) && minGameSample < 5
          ? 'At least one metric has a thin game sample — translation gaps are indicative, not conclusive.'
          : undefined
      }
      tableData={table}
      height={height}
      className={className}
    >
      <div className="flex h-full flex-col justify-center gap-3">
        {rows.map((r) => {
          const max = Math.max(r.gameValue ?? 0, r.practiceValue ?? 0, 1);
          const d = delta(
            r.higherIsBetter ? r.gameValue : r.practiceValue,
            r.higherIsBetter ? r.practiceValue : r.gameValue,
          );
          return (
            <div key={r.metricKey} className="grid grid-cols-[110px_1fr_56px] items-center gap-3">
              <span className="truncate text-xs font-medium text-warm-700">{r.label}</span>
              <div className="flex flex-col gap-1">
                <PairedRow label="Game" value={r.gameValue} max={max} unit={r.unit} tone="primary" />
                <PairedRow label="Prac" value={r.practiceValue} max={max} unit={r.unit} tone="warm" />
              </div>
              <span
                className={cn(
                  'text-right text-xs font-semibold tabular-nums',
                  d.tone === 'up' && 'text-primary-600',
                  d.tone === 'down' && 'text-pursuit',
                  (d.tone === 'flat' || d.tone === 'none') && 'text-warm-400',
                )}
              >
                {d.text}
              </span>
            </div>
          );
        })}
      </div>
    </StatVisualFrame>
  );
}

function PairedRow({
  label,
  value,
  max,
  unit,
  tone,
}: {
  label: string;
  value: number | null;
  max: number;
  unit?: string;
  tone: 'primary' | 'warm';
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
        {label}
      </span>
      <BulletBar value={value} max={max} tone={tone} height={7} />
      <span className="w-12 text-right text-micro tabular-nums text-warm-600">
        {value === null ? '—' : `${num(value, 1)}${unit ?? ''}`}
      </span>
    </div>
  );
}
