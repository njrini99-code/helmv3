'use client';

// =============================================================================
// src/components/baseball/stat-visuals/PitchingVisuals.tsx
//
// V10 baseball PITCHING stat visuals, each mounted inside the Foundations
// <StatVisualFrame> with source chips, sample size, honest confidence, context
// split, table fallback, insufficient-data gating, and chart-click into the
// source drawer.
//
// Charts (v10_baseball_stat_visual_contracts.md §"Pitching Visuals"):
//   - PitchShapeMap          §"Pitch Shape Map" (HB/IVB; 8/type to show, 25 trend)
//   - CommandHeatmap         §"Command Heatmap" (+ miss vectors; 25 / 15 by type)
//   - VelocityCommandDecay   §"Velocity And Command Decay" (1 outing / 3 trend)
//   - PitchMixOutcomeBoard   §"Pitch Mix And Outcome Board"
//   - ReleaseConsistencyPlot §"Release Consistency Plot"
//
// NO golf labels. Cream/green only. SVG render; aggregate dense pitch-shape
// scatter to hexbin above threshold.
// =============================================================================

import * as React from 'react';
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
  pct,
  num,
} from './chart-geometry';
import type {
  PitchShapePoint,
  MissVector,
  DecayPoint,
  PitchMixRow,
  ReleasePoint,
} from '@/lib/types/baseball-stat-visuals';
import type { BaseballDataContext } from '@/lib/types/baseball-stat-events';

// -----------------------------------------------------------------------------
// pitch-type color map — a curated qualitative ramp built ONLY from the
// cream/green system (binding owner decision: no blue/teal/violet/cyan). Pitch
// types stay distinguishable via a green→amber→warm→red spread at different
// lightnesses; the chart is always paired with a LABELED legend so colour is
// never the sole differentiator (StatVisualFrame honesty contract).
// -----------------------------------------------------------------------------

const PITCH_COLORS = [
  '#16a34a', // primary-600 (green)
  '#15803d', // primary-700 (deep green)
  '#d97706', // amber-600
  '#78716c', // warm-500
  '#dc2626', // red-600
  '#4ade80', // primary-400 (light green)
  '#a8a29e', // warm-400
  '#92400e', // amber-800 (bronze)
];

function pitchColorMap(types: string[]): Map<string, string> {
  const m = new Map<string, string>();
  types.forEach((t, i) => m.set(t, PITCH_COLORS[i % PITCH_COLORS.length] ?? '#a8a29e'));
  return m;
}

function uniqueContexts(contexts: BaseballDataContext[]): BaseballDataContext[] {
  return [...new Set(contexts)];
}

// =============================================================================
// Pitch Shape Map (HB / IVB)
// =============================================================================

export interface PitchShapeMapProps {
  points: PitchShapePoint[];
  sources?: StatVisualSourceChip[];
  onPointActivate?: (ids: string[]) => void;
  height?: number;
  className?: string;
}

export function PitchShapeMap({
  points,
  sources,
  onPointActivate,
  height = 320,
  className,
}: PitchShapeMapProps) {
  const [ctx, setCtx] = React.useState<BaseballDataContext | null>(null);
  const [ref, width] = useMeasuredWidth();

  const allContexts = React.useMemo(() => uniqueContexts(points.map((p) => p.context)), [points]);
  const valid = React.useMemo(
    () =>
      points.filter(
        (p) =>
          p.horizontalBreak !== null &&
          p.inducedVerticalBreak !== null &&
          (ctx === null || p.context === ctx),
      ),
    [points, ctx],
  );

  const types = React.useMemo(() => [...new Set(valid.map((p) => p.pitchType))], [valid]);
  const colors = React.useMemo(() => pitchColorMap(types), [types]);

  // Per-type gating: the smallest type sample determines whether we have a shape
  // read. We never claim a trend on a thin per-type sample.
  const perType = React.useMemo(() => {
    const counts = new Map<string, number>();
    valid.forEach((p) => counts.set(p.pitchType, (counts.get(p.pitchType) ?? 0) + 1));
    return counts;
  }, [valid]);
  const gate = gateSample(valid.length, SAMPLE_THRESHOLDS.pitchShapeType);
  const mode = scatterRenderMode(valid.length, SAMPLE_THRESHOLDS.pitchShapeType);

  const domainX = niceDomain(valid.map((p) => p.horizontalBreak), 0.1, [-24, 24]);
  const domainY = niceDomain(valid.map((p) => p.inducedVerticalBreak), 0.1, [-24, 24]);
  const innerW = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const innerH = Math.max(0, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const sx = linearScale(domainX, [PLOT_MARGIN.left, PLOT_MARGIN.left + innerW], true);
  const sy = linearScale(domainY, [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);

  const legend: LegendItem[] = types.map((t) => ({
    key: t,
    label: `${t} (${perType.get(t) ?? 0})${(perType.get(t) ?? 0) < SAMPLE_THRESHOLDS.pitchShapeType.read ? ' · thin' : ''}`,
    color: colors.get(t) ?? '#a8a29e',
  }));

  const bins = React.useMemo(
    () =>
      mode === 'aggregate'
        ? hexbin(
            valid.map((p) => ({ id: p.id, x: p.horizontalBreak, y: p.inducedVerticalBreak })),
            domainX,
            domainY,
            16,
          )
        : [],
    [mode, valid, domainX, domainY],
  );
  const maxBin = bins.reduce((m, b) => Math.max(m, b.count), 0) || 1;

  const table: StatVisualTableData = {
    caption: 'Per-pitch type, velocity, induced vertical break, horizontal break, spin and context.',
    columns: [
      { key: 'type', label: 'Pitch' },
      { key: 'velo', label: 'Velo', numeric: true },
      { key: 'ivb', label: 'IVB', numeric: true },
      { key: 'hb', label: 'HB', numeric: true },
      { key: 'spin', label: 'Spin', numeric: true },
      { key: 'context', label: 'Context' },
    ],
    rows: valid.map((p) => ({
      type: p.pitchType,
      velo: num(p.velocity, 1),
      ivb: num(p.inducedVerticalBreak, 1),
      hb: num(p.horizontalBreak, 1),
      spin: p.spinRate === null ? '—' : num(p.spinRate, 0),
      context: p.context,
    })),
  };

  return (
    <StatVisualFrame
      title="Pitch shape — HB / IVB"
      subtitle="What does the arsenal actually look like?"
      overline="Pitching"
      takeaway={gate.canRead ? `${types.length} pitch types · ${valid.length} pitches` : undefined}
      sources={sources}
      dataContexts={ctx ? [ctx] : allContexts}
      sample={{
        size: valid.length,
        unitLabel: 'pitches',
        confidence: gate.confidence,
        minForRead: SAMPLE_THRESHOLDS.pitchShapeType.read,
      }}
      lowConfidenceCaveat={
        types.some((t) => (perType.get(t) ?? 0) < SAMPLE_THRESHOLDS.pitchShapeType.read)
          ? 'Pitch types marked "thin" have too few pitches for a stable shape — treat their cluster as provisional.'
          : undefined
      }
      tableData={table}
      height={height}
      className={className}
      actions={<ContextSplitFilter available={allContexts} value={ctx} onChange={setCtx} />}
    >
      <div ref={ref} className="flex h-full flex-col">
        <svg width={width} height={height} className="overflow-visible" role="presentation">
          {/* zero crosshair */}
          <line x1={sx(0)} y1={PLOT_MARGIN.top} x2={sx(0)} y2={PLOT_MARGIN.top + innerH} stroke="var(--color-warm-200, #e7e5e4)" />
          <line x1={PLOT_MARGIN.left} y1={sy(0)} x2={PLOT_MARGIN.left + innerW} y2={sy(0)} stroke="var(--color-warm-200, #e7e5e4)" />
          <AxisX
            y={PLOT_MARGIN.top + innerH}
            x0={PLOT_MARGIN.left}
            x1={PLOT_MARGIN.left + innerW}
            ticks={makeTicks(domainX[0], domainX[1], sx, 5)}
            format={(v) => v.toFixed(0)}
            label="Horizontal break (in)"
          />
          <AxisY
            x={PLOT_MARGIN.left}
            y0={PLOT_MARGIN.top + innerH}
            y1={PLOT_MARGIN.top}
            ticks={makeTicks(domainY[0], domainY[1], sy, 5)}
            format={(v) => v.toFixed(0)}
            label="IVB (in)"
          />

          {mode === 'aggregate'
            ? bins.map((b, i) => (
                <circle
                  key={i}
                  cx={sx(b.cx)}
                  cy={sy(b.cy)}
                  r={4 + (b.count / maxBin) * 8}
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
                  <title>{`${b.count} pitches`}</title>
                </circle>
              ))
            : valid.map((p) => (
                <circle
                  key={p.id}
                  cx={sx(p.horizontalBreak as number)}
                  cy={sy(p.inducedVerticalBreak as number)}
                  r={4}
                  fill={colors.get(p.pitchType) ?? '#a8a29e'}
                  fillOpacity={0.8}
                  stroke="white"
                  strokeWidth={0.5}
                  className={p.source && onPointActivate ? 'cursor-pointer' : undefined}
                  onClick={onPointActivate && p.source ? () => onPointActivate([p.id]) : undefined}
                >
                  <title>{`${p.pitchType} · ${num(p.velocity, 0)} mph · IVB ${num(p.inducedVerticalBreak, 0)} / HB ${num(p.horizontalBreak, 0)}`}</title>
                </circle>
              ))}
        </svg>
        <ChartLegend items={legend} className="mt-1 px-1" />
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Command Heatmap (+ miss vectors)
// =============================================================================

export interface CommandHeatmapProps {
  /** density cells across a normalized [-1,1] x [-1,1] location grid. */
  vectors: MissVector[];
  totalPitches: number;
  /** when true, draws miss vectors from target -> actual (needs target coords). */
  showMissVectors?: boolean;
  onToggleVectors?: (v: boolean) => void;
  sources?: StatVisualSourceChip[];
  onPointActivate?: (ids: string[]) => void;
  height?: number;
  className?: string;
}

export function CommandHeatmap({
  vectors,
  totalPitches,
  showMissVectors = true,
  onToggleVectors,
  sources,
  onPointActivate,
  height = 320,
  className,
}: CommandHeatmapProps) {
  const gate = gateSample(totalPitches, SAMPLE_THRESHOLDS.commandHeatmap);
  const located = React.useMemo(
    () => vectors.filter((v) => v.actualX !== null && v.actualY !== null),
    [vectors],
  );
  const withTarget = located.filter((v) => v.targetX !== null && v.targetY !== null);

  const size = Math.min(height - 28, 300);
  const pad = 24;
  const span = size - pad * 2;
  // normalized [-1,1] -> px (zone roughly [-0.5,0.5])
  const nx = (x: number) => pad + ((x + 1) / 2) * span;
  const ny = (y: number) => pad + ((1 - y) / 2) * span;

  const table: StatVisualTableData = {
    caption: 'Per-pitch actual location, intended target (when known) and miss distance.',
    columns: [
      { key: 'type', label: 'Pitch' },
      { key: 'ax', label: 'Loc X', numeric: true },
      { key: 'ay', label: 'Loc Y', numeric: true },
      { key: 'miss', label: 'Miss', numeric: true },
    ],
    rows: located.map((v) => {
      const miss =
        v.targetX !== null && v.targetY !== null && v.actualX !== null && v.actualY !== null
          ? Math.hypot(v.actualX - v.targetX, v.actualY - v.targetY)
          : null;
      return {
        type: v.pitchType ?? '—',
        ax: num(v.actualX, 2),
        ay: num(v.actualY, 2),
        miss: miss === null ? '—' : num(miss, 2),
      };
    }),
  };

  return (
    <StatVisualFrame
      title="Command — location & misses"
      subtitle="Can the pitcher locate, and where do misses happen?"
      overline="Pitching"
      takeaway={gate.canRead ? `${located.length} located pitches` : undefined}
      sources={sources}
      sample={{
        size: totalPitches,
        unitLabel: 'pitches',
        confidence: gate.confidence,
        minForRead: SAMPLE_THRESHOLDS.commandHeatmap.read,
      }}
      lowConfidenceCaveat={
        showMissVectors && withTarget.length === 0
          ? 'No intended-target data on these pitches — miss vectors are unavailable; only actual locations are shown.'
          : undefined
      }
      tableData={table}
      height={height}
      className={className}
      actions={
        onToggleVectors && withTarget.length > 0 ? (
          <TabStrip
            ariaLabel="Command view"
            value={showMissVectors ? 'vectors' : 'density'}
            onChange={(v) => onToggleVectors(v === 'vectors')}
            options={[
              { value: 'density', label: 'Locations' },
              { value: 'vectors', label: 'Miss vectors' },
            ]}
          />
        ) : undefined
      }
    >
      <div className="flex h-full items-center justify-center">
        <svg width={size} height={size} role="presentation">
          <rect x={0} y={0} width={size} height={size} className="fill-warm-50" rx={8} />
          {/* strike zone box (normalized [-0.5,0.5]) */}
          <rect
            x={nx(-0.5)}
            y={ny(0.5)}
            width={nx(0.5) - nx(-0.5)}
            height={ny(-0.5) - ny(0.5)}
            fill="none"
            stroke="var(--color-warm-400, #a8a29e)"
            strokeWidth={1.5}
          />
          {/* heat dots for actual locations */}
          {located.map((v) => (
            <circle
              key={v.id}
              cx={nx(v.actualX as number)}
              cy={ny(v.actualY as number)}
              r={5}
              fill={greenHeat(0.6)}
              fillOpacity={0.5}
              className={v.source && onPointActivate ? 'cursor-pointer' : undefined}
              onClick={onPointActivate && v.source ? () => onPointActivate([v.id]) : undefined}
            />
          ))}
          {/* miss vectors target -> actual */}
          {showMissVectors &&
            withTarget.map((v) => (
              <g key={`vec-${v.id}`}>
                <line
                  x1={nx(v.targetX as number)}
                  y1={ny(v.targetY as number)}
                  x2={nx(v.actualX as number)}
                  y2={ny(v.actualY as number)}
                  stroke="#d97706"
                  strokeWidth={1}
                  strokeOpacity={0.7}
                />
                {/* Intended target as a small diamond (shape-distinct from the
                    round actual-location dots — never color-only). */}
                <rect
                  x={nx(v.targetX as number) - 2.5}
                  y={ny(v.targetY as number) - 2.5}
                  width={5}
                  height={5}
                  fill="#44403c"
                  transform={`rotate(45 ${nx(v.targetX as number)} ${ny(v.targetY as number)})`}
                />
              </g>
            ))}
        </svg>
      </div>
      <ChartLegend
        items={[
          { key: 'loc', label: 'Actual location', color: greenHeat(0.6) },
          ...(showMissVectors && withTarget.length > 0
            ? ([
                { key: 'target', label: 'Intended target', color: '#44403c', shape: 'diamond' },
                { key: 'miss', label: 'Miss vector', color: '#d97706' },
              ] as LegendItem[])
            : []),
        ]}
        className="mt-1 justify-center"
      />
    </StatVisualFrame>
  );
}

// =============================================================================
// Velocity & Command Decay
// =============================================================================

export interface VelocityCommandDecayProps {
  segments: DecayPoint[];
  /** number of distinct outings this trend draws from (gates trend claims). */
  outings: number;
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function VelocityCommandDecay({
  segments,
  outings,
  sources,
  height = 300,
  className,
}: VelocityCommandDecayProps) {
  const [ref, width] = useMeasuredWidth();
  const gate = gateSample(outings, SAMPLE_THRESHOLDS.decay);

  const veloDomain = niceDomain(segments.map((s) => s.velocity), 0.15, [80, 95]);
  const innerW = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const innerH = Math.max(0, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const sx = linearScale([0, Math.max(1, segments.length - 1)], [PLOT_MARGIN.left, PLOT_MARGIN.left + innerW]);
  const sVelo = linearScale(veloDomain, [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);
  const sRate = linearScale([0, 1], [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);

  const veloPath = segments
    .map((s, i) => (s.velocity === null ? null : `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sVelo(s.velocity)}`))
    .filter(Boolean)
    .join(' ');
  const strikePath = segments
    .map((s, i) => (s.strikeRate === null ? null : `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sRate(s.strikeRate)}`))
    .filter(Boolean)
    .join(' ');

  const table: StatVisualTableData = {
    caption: 'Per pitch-count segment velocity, strike rate, miss rate.',
    columns: [
      { key: 'segment', label: 'Segment' },
      { key: 'pitches', label: 'Pitches', numeric: true },
      { key: 'velo', label: 'Velo', numeric: true },
      { key: 'strike', label: 'Strike%', numeric: true },
      { key: 'miss', label: 'Miss%', numeric: true },
    ],
    rows: segments.map((s) => ({
      segment: s.segment,
      pitches: s.pitches,
      velo: num(s.velocity, 1),
      strike: pct(s.strikeRate, 0),
      miss: pct(s.missRate, 0),
    })),
  };

  return (
    <StatVisualFrame
      title="Velocity & command decay"
      subtitle="Is performance dropping with workload?"
      overline="Pitching"
      takeaway={
        gate.canTrend
          ? `${outings} outings — decay trend reliable`
          : `${outings} outing${outings === 1 ? '' : 's'} — single-outing read only`
      }
      sources={sources}
      sample={{ size: outings, unitLabel: 'outings', confidence: gate.confidence, minForRead: 1 }}
      lowConfidenceCaveat={
        !gate.canTrend
          ? 'Fewer than 3 outings — this shows one outing’s shape, not a fatigue trend.'
          : undefined
      }
      tableData={table}
      height={height}
      className={className}
    >
      <div ref={ref} className="flex h-full flex-col">
        <svg width={width} height={height} className="overflow-visible" role="presentation">
          <AxisX
            y={PLOT_MARGIN.top + innerH}
            x0={PLOT_MARGIN.left}
            x1={PLOT_MARGIN.left + innerW}
            ticks={segments.map((_s, i) => ({ value: i, pos: sx(i) }))}
            format={(v) => segments[v]?.segment ?? ''}
            label="Pitch-count segment"
          />
          <AxisY
            x={PLOT_MARGIN.left}
            y0={PLOT_MARGIN.top + innerH}
            y1={PLOT_MARGIN.top}
            ticks={makeTicks(veloDomain[0], veloDomain[1], sVelo, 4)}
            format={(v) => v.toFixed(0)}
            label="Velo"
          />
          {strikePath ? <path d={strikePath} fill="none" stroke="#d97706" strokeWidth={1.5} strokeDasharray="4 3" /> : null}
          {veloPath ? <path d={veloPath} fill="none" stroke="#16A34A" strokeWidth={2} /> : null}
          {segments.map((s, i) =>
            s.velocity === null ? null : (
              <circle key={i} cx={sx(i)} cy={sVelo(s.velocity)} r={3} fill="#16A34A" stroke="white" strokeWidth={1}>
                <title>{`${s.segment}: ${num(s.velocity, 1)} mph, ${pct(s.strikeRate, 0)} strikes`}</title>
              </circle>
            ),
          )}
        </svg>
        <ChartLegend
          items={[
            { key: 'velo', label: 'Velocity', color: '#16A34A' },
            { key: 'strike', label: 'Strike rate', color: '#d97706' },
          ]}
          className="mt-1 px-1"
        />
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Pitch Mix & Outcome Board
// =============================================================================

export interface PitchMixOutcomeBoardProps {
  rows: PitchMixRow[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function PitchMixOutcomeBoard({
  rows,
  sources,
  height = 320,
  className,
}: PitchMixOutcomeBoardProps) {
  const total = rows.reduce((s, r) => s + r.pitches, 0);
  const gate = gateSample(total, { read: 25, trend: 80 });
  const colors = pitchColorMap(rows.map((r) => r.pitchType));

  const table: StatVisualTableData = {
    caption: 'Per-pitch usage, strike, whiff, CSW, chase and hard-hit rates.',
    columns: [
      { key: 'type', label: 'Pitch' },
      { key: 'pitches', label: 'Pitches', numeric: true },
      { key: 'usage', label: 'Usage', numeric: true },
      { key: 'strike', label: 'Strike%', numeric: true },
      { key: 'whiff', label: 'Whiff%', numeric: true },
      { key: 'csw', label: 'CSW%', numeric: true },
      { key: 'chase', label: 'Chase%', numeric: true },
      { key: 'hard', label: 'Hard%', numeric: true },
    ],
    rows: rows.map((r) => ({
      type: r.pitchType,
      pitches: r.pitches,
      usage: pct(r.usagePct, 0),
      strike: pct(r.strikeRate, 0),
      whiff: pct(r.whiffRate, 0),
      csw: pct(r.cswRate, 0),
      chase: pct(r.chaseRate, 0),
      hard: pct(r.hardHitRate, 0),
    })),
  };

  return (
    <StatVisualFrame
      title="Pitch mix & outcomes"
      subtitle="Which pitches are working, and when?"
      overline="Pitching"
      sources={sources}
      sample={{ size: total, unitLabel: 'pitches', confidence: gate.confidence, minForRead: 25 }}
      tableData={table}
      height={height}
      className={className}
    >
      <div className="flex h-full flex-col gap-2.5 overflow-auto">
        {rows.map((r) => (
          <div key={r.pitchType} className="grid grid-cols-[88px_1fr] items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: colors.get(r.pitchType) }}
                aria-hidden
              />
              <span className="truncate text-xs font-medium text-warm-700">{r.pitchType}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              <MixMetric label="Usage" rate={r.usagePct} />
              <MixMetric label="Strike" rate={r.strikeRate} />
              <MixMetric label="Whiff" rate={r.whiffRate} tone="primary" />
              <MixMetric label="CSW" rate={r.cswRate} tone="primary" />
              <MixMetric label="Chase" rate={r.chaseRate} />
              <MixMetric label="Hard" rate={r.hardHitRate} tone="amber" />
            </div>
          </div>
        ))}
      </div>
    </StatVisualFrame>
  );
}

function MixMetric({
  label,
  rate,
  tone = 'warm',
}: {
  label: string;
  rate: number | null;
  tone?: 'primary' | 'amber' | 'warm';
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-11 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
        {label}
      </span>
      <BulletBar value={rate} max={1} tone={tone} height={6} />
      <span className="w-8 text-right text-[11px] tabular-nums text-warm-600">{pct(rate, 0)}</span>
    </div>
  );
}

// =============================================================================
// Release Consistency Plot
// =============================================================================

export interface ReleaseConsistencyPlotProps {
  points: ReleasePoint[];
  sources?: StatVisualSourceChip[];
  onPointActivate?: (ids: string[]) => void;
  height?: number;
  className?: string;
}

export function ReleaseConsistencyPlot({
  points,
  sources,
  onPointActivate,
  height = 320,
  className,
}: ReleaseConsistencyPlotProps) {
  const [ref, width] = useMeasuredWidth();
  const [activeType, setActiveType] = React.useState<string | 'all'>('all');

  const types = React.useMemo(() => [...new Set(points.map((p) => p.pitchType))], [points]);
  const colors = React.useMemo(() => pitchColorMap(types), [types]);
  // Guard against a stale selection: if the data refreshes and the chosen pitch
  // type disappears, fall back to 'all' (derived — no setState-during-render).
  const effectiveType = activeType !== 'all' && !types.includes(activeType) ? 'all' : activeType;
  const valid = React.useMemo(
    () =>
      points.filter(
        (p) =>
          p.releaseSide !== null &&
          p.releaseHeight !== null &&
          (effectiveType === 'all' || p.pitchType === effectiveType),
      ),
    [points, effectiveType],
  );
  const gate = gateSample(valid.length, SAMPLE_THRESHOLDS.release);

  const domainX = niceDomain(valid.map((p) => p.releaseSide), 0.2, [-4, 4]);
  const domainY = niceDomain(valid.map((p) => p.releaseHeight), 0.2, [4, 7]);
  const innerW = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const innerH = Math.max(0, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const sx = linearScale(domainX, [PLOT_MARGIN.left, PLOT_MARGIN.left + innerW], true);
  const sy = linearScale(domainY, [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);

  const table: StatVisualTableData = {
    caption: 'Per-pitch release side, release height, extension, pitch type and date.',
    columns: [
      { key: 'type', label: 'Pitch' },
      { key: 'side', label: 'Rel side', numeric: true },
      { key: 'height', label: 'Rel ht', numeric: true },
      { key: 'ext', label: 'Ext', numeric: true },
      { key: 'date', label: 'Date' },
    ],
    rows: valid.map((p) => ({
      type: p.pitchType,
      side: num(p.releaseSide, 2),
      height: num(p.releaseHeight, 2),
      ext: p.extension === null ? '—' : num(p.extension, 2),
      date: p.date ?? '—',
    })),
  };

  return (
    <StatVisualFrame
      title="Release consistency"
      subtitle="Tipping or losing repeatability?"
      overline="Pitching"
      sources={sources}
      sample={{ size: valid.length, unitLabel: 'pitches', confidence: gate.confidence, minForRead: SAMPLE_THRESHOLDS.release.read }}
      tableData={table}
      height={height}
      className={className}
      actions={
        types.length > 1 ? (
          <TabStrip
            ariaLabel="Pitch type"
            value={effectiveType}
            onChange={setActiveType}
            options={[{ value: 'all' as const, label: 'All' }, ...types.map((t) => ({ value: t, label: t }))]}
          />
        ) : undefined
      }
    >
      <div ref={ref} className="flex h-full flex-col">
        <svg width={width} height={height} className="overflow-visible" role="presentation">
          <AxisX
            y={PLOT_MARGIN.top + innerH}
            x0={PLOT_MARGIN.left}
            x1={PLOT_MARGIN.left + innerW}
            ticks={makeTicks(domainX[0], domainX[1], sx, 5)}
            format={(v) => v.toFixed(1)}
            label="Release side (ft)"
          />
          <AxisY
            x={PLOT_MARGIN.left}
            y0={PLOT_MARGIN.top + innerH}
            y1={PLOT_MARGIN.top}
            ticks={makeTicks(domainY[0], domainY[1], sy, 4)}
            format={(v) => v.toFixed(1)}
            label="Release height (ft)"
          />
          {valid.map((p) => (
            <circle
              key={p.id}
              cx={sx(p.releaseSide as number)}
              cy={sy(p.releaseHeight as number)}
              r={3.5}
              fill={colors.get(p.pitchType) ?? '#a8a29e'}
              fillOpacity={0.75}
              stroke="white"
              strokeWidth={0.5}
              className={p.source && onPointActivate ? 'cursor-pointer' : undefined}
              onClick={onPointActivate && p.source ? () => onPointActivate([p.id]) : undefined}
            >
              <title>{`${p.pitchType} · side ${num(p.releaseSide, 2)} / ht ${num(p.releaseHeight, 2)}`}</title>
            </circle>
          ))}
        </svg>
        <ChartLegend
          items={types.map((t) => ({ key: t, label: t, color: colors.get(t) ?? '#a8a29e' }))}
          className="mt-1 px-1"
        />
      </div>
    </StatVisualFrame>
  );
}
