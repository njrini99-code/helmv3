'use client';

// =============================================================================
// src/components/baseball/stat-visuals/PerformanceVisuals.tsx
//
// V10 baseball PERFORMANCE / READINESS stat visuals, mounted in the Foundations
// <StatVisualFrame> with the full honesty contract.
//
// Charts (v10_baseball_stat_visual_contracts.md §"Performance And Readiness"):
//   - ReadinessHeatStrip    §"Readiness Heat Strip"
//   - LiftProgressionChart  §"Lift Progression Chart"
//   - PitcherWorkloadOverlay §"Pitcher Workload Overlay"
//
// NO golf labels. Cream/green only. Readiness/soreness data is staff/role-gated
// at the read-model layer — this component renders whatever rows it is GIVEN and
// never invents missing check-ins (renders a 'missing' cell, never a fake score).
// =============================================================================

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
} from './chart-primitives';
import { linearScale, niceDomain, gateSample, num } from './chart-geometry';
import type {
  ReadinessRow,
  ReadinessCellStatus,
  LiftProgressionPoint,
  PitcherWorkloadDay,
} from '@/lib/types/baseball-stat-visuals';

// =============================================================================
// Readiness Heat Strip
// =============================================================================

const READINESS_COLOR: Record<ReadinessCellStatus, string> = {
  ready: '#16A34A',
  limited: '#d97706',
  high_soreness: '#dc2626',
  missing: '#e7e5e4',
};
const READINESS_LABEL: Record<ReadinessCellStatus, string> = {
  ready: 'Ready',
  limited: 'Limited',
  high_soreness: 'High soreness',
  missing: 'Missing check-in',
};

export interface ReadinessHeatStripProps {
  rows: ReadinessRow[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function ReadinessHeatStrip({
  rows,
  sources,
  height = 320,
  className,
}: ReadinessHeatStripProps) {
  const dayCount = rows[0]?.cells.length ?? 0;
  const gate = gateSample(rows.length, { read: 1, trend: 5 });

  const table: StatVisualTableData = {
    caption: 'Per player daily readiness status across the window.',
    columns: [
      { key: 'player', label: 'Player' },
      { key: 'group', label: 'Group' },
      { key: 'ready', label: 'Ready', numeric: true },
      { key: 'limited', label: 'Limited', numeric: true },
      { key: 'sore', label: 'Sore', numeric: true },
      { key: 'missing', label: 'Missing', numeric: true },
    ],
    rows: rows.map((r) => {
      const tally = r.cells.reduce(
        (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
        { ready: 0, limited: 0, high_soreness: 0, missing: 0 } as Record<ReadinessCellStatus, number>,
      );
      return {
        player: r.playerName,
        group: r.positionGroup ?? '—',
        ready: tally.ready,
        limited: tally.limited,
        sore: tally.high_soreness,
        missing: tally.missing,
      };
    }),
  };

  return (
    <StatVisualFrame
      title="Readiness heat strip"
      subtitle="Who is ready, limited, or needs a check-in?"
      overline="Readiness"
      dataContexts={['readiness']}
      sources={sources}
      sample={{ size: rows.length, unitLabel: 'players', confidence: gate.confidence, minForRead: 1 }}
      tableData={table}
      height={height}
      className={className}
    >
      <div className="h-full overflow-auto">
        <div className="flex flex-col gap-1">
          {rows.map((r) => (
            <div key={r.playerId} className="grid grid-cols-[120px_1fr] items-center gap-2">
              <span className="truncate text-xs font-medium text-warm-700" title={r.playerName}>
                {r.playerName}
              </span>
              <div className="flex gap-0.5" style={{ ['--cells' as string]: dayCount }}>
                {r.cells.map((c) => (
                  <div
                    key={c.date}
                    className="h-5 flex-1 rounded-sm"
                    style={{ background: READINESS_COLOR[c.status] }}
                    title={`${c.date}: ${READINESS_LABEL[c.status]}${c.score !== null ? ` (${c.score})` : ''}`}
                    aria-label={`${r.playerName} ${c.date} ${READINESS_LABEL[c.status]}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <ChartLegend
        items={(Object.keys(READINESS_COLOR) as ReadinessCellStatus[]).map((s) => ({
          key: s,
          label: READINESS_LABEL[s],
          color: READINESS_COLOR[s],
          shape: 'square' as const,
        }))}
        className="mt-2"
      />
    </StatVisualFrame>
  );
}

// =============================================================================
// Lift Progression Chart
// =============================================================================

export interface LiftProgressionChartProps {
  exercise: string;
  points: LiftProgressionPoint[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function LiftProgressionChart({
  exercise,
  points,
  sources,
  height = 300,
  className,
}: LiftProgressionChartProps) {
  const [ref, width] = useMeasuredWidth();
  const gate = gateSample(points.length, { read: 2, trend: 5 });

  const loadDomain = niceDomain(
    points.flatMap((p) => [p.actualLoad, p.targetLoad]),
    0.1,
    [0, 100],
  );
  const innerW = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const innerH = Math.max(0, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const sx = linearScale([0, Math.max(1, points.length - 1)], [PLOT_MARGIN.left, PLOT_MARGIN.left + innerW]);
  const sLoad = linearScale(loadDomain, [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);

  const actualPath = points
    .map((p, i) => (p.actualLoad === null ? null : `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sLoad(p.actualLoad)}`))
    .filter(Boolean)
    .join(' ');
  const targetPath = points
    .map((p, i) => (p.targetLoad === null ? null : `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sLoad(p.targetLoad)}`))
    .filter(Boolean)
    .join(' ');

  const table: StatVisualTableData = {
    caption: 'Per session actual load, target load, reps and RPE.',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'actual', label: 'Actual', numeric: true },
      { key: 'target', label: 'Target', numeric: true },
      { key: 'reps', label: 'Reps', numeric: true },
      { key: 'rpe', label: 'RPE', numeric: true },
    ],
    rows: points.map((p) => ({
      date: p.date,
      actual: num(p.actualLoad, 0),
      target: num(p.targetLoad, 0),
      reps: p.reps ?? '—',
      rpe: p.rpe === null ? '—' : num(p.rpe, 1),
    })),
  };

  return (
    <StatVisualFrame
      title={`Lift progression — ${exercise}`}
      subtitle="Progressing without workload warning signs?"
      overline="Performance"
      dataContexts={['lift']}
      sources={sources}
      sample={{ size: points.length, unitLabel: 'sessions', confidence: gate.confidence, minForRead: 2 }}
      tableData={table}
      height={height}
      className={className}
    >
      <div ref={ref} className="flex h-full flex-col">
        <svg width={width} height={height} className="overflow-visible" role="presentation">
          <AxisY
            x={PLOT_MARGIN.left}
            y0={PLOT_MARGIN.top + innerH}
            y1={PLOT_MARGIN.top}
            ticks={makeTicks(loadDomain[0], loadDomain[1], sLoad, 4)}
            format={(v) => v.toFixed(0)}
            label="Load"
          />
          {targetPath ? <path d={targetPath} fill="none" stroke="#a8a29e" strokeWidth={1.5} strokeDasharray="4 3" /> : null}
          {actualPath ? <path d={actualPath} fill="none" stroke="#16A34A" strokeWidth={2} /> : null}
          {points.map((p, i) =>
            p.actualLoad === null ? null : (
              <circle key={i} cx={sx(i)} cy={sLoad(p.actualLoad)} r={3} fill="#16A34A" stroke="white" strokeWidth={1}>
                <title>{`${p.date}: ${num(p.actualLoad, 0)} (RPE ${p.rpe ?? '—'})`}</title>
              </circle>
            ),
          )}
          <AxisX
            y={PLOT_MARGIN.top + innerH}
            x0={PLOT_MARGIN.left}
            x1={PLOT_MARGIN.left + innerW}
            ticks={points.map((_p, i) => ({ value: i, pos: sx(i) }))}
            format={(v) => (points[v]?.date ?? '').slice(5)}
          />
        </svg>
        <ChartLegend
          items={[
            { key: 'actual', label: 'Actual load', color: '#16A34A' },
            { key: 'target', label: 'Target load', color: '#a8a29e' },
          ]}
          className="mt-1 px-1"
        />
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Pitcher Workload Overlay
// =============================================================================

export interface PitcherWorkloadOverlayProps {
  days: PitcherWorkloadDay[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function PitcherWorkloadOverlay({
  days,
  sources,
  height = 300,
  className,
}: PitcherWorkloadOverlayProps) {
  const [ref, width] = useMeasuredWidth();
  const gate = gateSample(days.length, { read: 3, trend: 7 });

  const maxLoad = Math.max(
    1,
    ...days.map((d) => d.gamePitches + d.bullpenPitches + d.highIntentThrows),
  );
  const innerW = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const innerH = Math.max(0, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const sx = linearScale([0, Math.max(1, days.length - 1)], [PLOT_MARGIN.left, PLOT_MARGIN.left + innerW]);
  const sLoad = linearScale([0, maxLoad], [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);
  const sReady = linearScale([0, 100], [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);
  const barW = Math.max(6, (innerW / Math.max(1, days.length)) * 0.55);

  const readyPath = days
    .map((d, i) => (d.readiness === null ? null : `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sReady(d.readiness)}`))
    .filter(Boolean)
    .join(' ');

  const table: StatVisualTableData = {
    caption: 'Per day game pitches, bullpen pitches, high-intent throws, readiness and velocity.',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'game', label: 'Game', numeric: true },
      { key: 'pen', label: 'Pen', numeric: true },
      { key: 'intent', label: 'High-intent', numeric: true },
      { key: 'ready', label: 'Readiness', numeric: true },
      { key: 'velo', label: 'Velo', numeric: true },
    ],
    rows: days.map((d) => ({
      date: d.date,
      game: d.gamePitches,
      pen: d.bullpenPitches,
      intent: d.highIntentThrows,
      ready: d.readiness === null ? '—' : num(d.readiness, 0),
      velo: num(d.velocity, 1),
    })),
  };

  return (
    <StatVisualFrame
      title="Pitcher workload overlay"
      subtitle="Is pitcher workload manageable?"
      overline="Workload"
      sources={sources}
      sample={{ size: days.length, unitLabel: 'days', confidence: gate.confidence, minForRead: 3 }}
      tableData={table}
      height={height}
      className={className}
    >
      <div ref={ref} className="flex h-full flex-col">
        <svg width={width} height={height} className="overflow-visible" role="presentation">
          <AxisY
            x={PLOT_MARGIN.left}
            y0={PLOT_MARGIN.top + innerH}
            y1={PLOT_MARGIN.top}
            ticks={makeTicks(0, maxLoad, sLoad, 4)}
            format={(v) => v.toFixed(0)}
            label="Throws"
          />
          {days.map((d, i) => {
            const x = sx(i) - barW / 2;
            const g = d.gamePitches;
            const p = d.bullpenPitches;
            const h = d.highIntentThrows;
            const yG = sLoad(g);
            const yP = sLoad(g + p);
            const yH = sLoad(g + p + h);
            return (
              <g key={d.date}>
                <rect x={x} y={yG} width={barW} height={Math.max(0, PLOT_MARGIN.top + innerH - yG)} fill="#16A34A" rx={2} />
                <rect x={x} y={yP} width={barW} height={Math.max(0, yG - yP)} fill="#86efac" rx={2} />
                <rect x={x} y={yH} width={barW} height={Math.max(0, yP - yH)} fill="#d97706" rx={2} />
              </g>
            );
          })}
          {readyPath ? <path d={readyPath} fill="none" stroke="#0e7490" strokeWidth={2} /> : null}
          <AxisX
            y={PLOT_MARGIN.top + innerH}
            x0={PLOT_MARGIN.left}
            x1={PLOT_MARGIN.left + innerW}
            ticks={days.map((_d, i) => ({ value: i, pos: sx(i) }))}
            format={(v) => (days[v]?.date ?? '').slice(5)}
          />
        </svg>
        <ChartLegend
          items={[
            { key: 'game', label: 'Game pitches', color: '#16A34A', shape: 'square' },
            { key: 'pen', label: 'Bullpen', color: '#86efac', shape: 'square' },
            { key: 'intent', label: 'High-intent', color: '#d97706', shape: 'square' },
            { key: 'ready', label: 'Readiness', color: '#0e7490' },
          ]}
          className="mt-1 px-1"
        />
      </div>
    </StatVisualFrame>
  );
}
