'use client';

// =============================================================================
// src/components/baseball/stat-visuals/FieldingVisuals.tsx
//
// V10 baseball CATCHING / DEFENSE / BASERUNNING stat visuals, each mounted in
// the Foundations <StatVisualFrame> with full honesty contract (source chips,
// sample size, confidence, table fallback, insufficient-data gating, drawer).
//
// Charts (v10_baseball_stat_visual_contracts.md):
//   - CatcherWorkloadBoard  §"Catcher Workload Board" (workload + readiness)
//   - BatteryMatrix         §"Battery Performance Matrix" (never overstate impact)
//   - DefensiveEventMap     §"Defensive Event Map" (field diagram + filters)
//   - BaserunningBoard      §"Speed And Decision Board"
//
// NO golf labels. Cream/green only.
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
  ContextSplitFilter,
  type LegendItem,
} from './chart-primitives';
import { linearScale, gateSample, greenHeat, num } from './chart-geometry';
import type {
  CatcherWorkloadPoint,
  BatteryCell,
  DefensiveEventPoint,
  BaserunningRow,
} from '@/lib/types/baseball-stat-visuals';
import type { BaseballDataContext } from '@/lib/types/baseball-stat-events';

function uniqueContexts(c: BaseballDataContext[]): BaseballDataContext[] {
  return [...new Set(c)];
}

// =============================================================================
// Catcher Workload Board
// =============================================================================

export interface CatcherWorkloadBoardProps {
  points: CatcherWorkloadPoint[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function CatcherWorkloadBoard({
  points,
  sources,
  height = 300,
  className,
}: CatcherWorkloadBoardProps) {
  const [ref, width] = useMeasuredWidth();
  const gate = gateSample(points.length, { read: 3, trend: 7 });

  const maxLoad = Math.max(
    1,
    ...points.map((p) => (p.inningsCaught ?? 0) + (p.bullpensCaught ?? 0)),
  );
  const innerW = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const innerH = Math.max(0, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const sx = linearScale([0, Math.max(1, points.length - 1)], [PLOT_MARGIN.left, PLOT_MARGIN.left + innerW]);
  const sLoad = linearScale([0, maxLoad], [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);
  const sReady = linearScale([0, 100], [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);
  const barW = Math.max(6, (innerW / Math.max(1, points.length)) * 0.55);

  const readyPath = points
    .map((p, i) => (p.readiness === null ? null : `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sReady(p.readiness)}`))
    .filter(Boolean)
    .join(' ');

  const table: StatVisualTableData = {
    caption: 'Per-day innings caught, bullpens caught, throws and readiness.',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'innings', label: 'Innings', numeric: true },
      { key: 'pens', label: 'Pens', numeric: true },
      { key: 'throws', label: 'Throws', numeric: true },
      { key: 'ready', label: 'Readiness', numeric: true },
    ],
    rows: points.map((p) => ({
      date: p.date,
      innings: p.inningsCaught ?? '—',
      pens: p.bullpensCaught ?? '—',
      throws: p.throws ?? '—',
      ready: p.readiness === null ? '—' : num(p.readiness, 0),
    })),
  };

  return (
    <StatVisualFrame
      title="Catcher workload & readiness"
      subtitle="Is workload affecting performance or availability?"
      overline="Catching"
      sources={sources}
      sample={{ size: points.length, unitLabel: 'days', confidence: gate.confidence, minForRead: 3 }}
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
            label="Load"
          />
          {points.map((p, i) => {
            const innings = p.inningsCaught ?? 0;
            const pens = p.bullpensCaught ?? 0;
            const x = sx(i) - barW / 2;
            return (
              <g key={p.date}>
                <rect x={x} y={sLoad(innings)} width={barW} height={Math.max(0, PLOT_MARGIN.top + innerH - sLoad(innings))} fill="#16A34A" rx={2} />
                <rect x={x} y={sLoad(innings + pens)} width={barW} height={Math.max(0, sLoad(innings) - sLoad(innings + pens))} fill="#86efac" rx={2} />
              </g>
            );
          })}
          {readyPath ? <path d={readyPath} fill="none" stroke="#d97706" strokeWidth={2} /> : null}
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
            { key: 'innings', label: 'Innings caught', color: '#16A34A', shape: 'square' },
            { key: 'pens', label: 'Bullpens caught', color: '#86efac', shape: 'square' },
            { key: 'ready', label: 'Readiness', color: '#d97706' },
          ]}
          className="mt-1 px-1"
        />
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Battery Performance Matrix
// =============================================================================

export interface BatteryMatrixProps {
  cells: BatteryCell[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function BatteryMatrix({ cells, sources, height = 320, className }: BatteryMatrixProps) {
  const pitchers = React.useMemo(
    () => [...new Map(cells.map((c) => [c.pitcherId, c.pitcherName])).entries()],
    [cells],
  );
  const catchers = React.useMemo(
    () => [...new Map(cells.map((c) => [c.catcherId, c.catcherName])).entries()],
    [cells],
  );
  const lookup = React.useMemo(() => {
    const m = new Map<string, BatteryCell>();
    cells.forEach((c) => m.set(`${c.pitcherId}:${c.catcherId}`, c));
    return m;
  }, [cells]);
  const totalInnings = cells.reduce((s, c) => s + c.innings, 0);
  const gate = gateSample(totalInnings, { read: 6, trend: 30 });

  const table: StatVisualTableData = {
    caption: 'Pitcher/catcher pair innings and strike rate; thin samples flagged.',
    columns: [
      { key: 'pitcher', label: 'Pitcher' },
      { key: 'catcher', label: 'Catcher' },
      { key: 'innings', label: 'Innings', numeric: true },
      { key: 'strike', label: 'Strike%', numeric: true },
      { key: 'note', label: 'Note' },
    ],
    rows: cells.map((c) => ({
      pitcher: c.pitcherName,
      catcher: c.catcherName,
      innings: c.innings,
      strike: c.strikeRate === null ? '—' : `${Math.round(c.strikeRate * 100)}%`,
      note: c.thinSample ? 'Sample too small' : '',
    })),
  };

  return (
    <StatVisualFrame
      title="Battery matrix"
      subtitle="Which pitcher/catcher pairs work best?"
      overline="Catching"
      sources={sources}
      sample={{ size: totalInnings, unitLabel: 'innings', confidence: gate.confidence, minForRead: 6 }}
      lowConfidenceCaveat="Battery cells show sample + strike rate only — small samples are flagged and never read as causal impact."
      tableData={table}
      height={height}
      className={className}
    >
      <div className="h-full overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-cream-100 px-2 py-1.5 text-left font-semibold text-warm-500">
                P \ C
              </th>
              {catchers.map(([id, name]) => (
                <th key={id} className="px-2 py-1.5 text-center font-semibold text-warm-600">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pitchers.map(([pid, pname]) => (
              <tr key={pid}>
                <td className="sticky left-0 z-10 bg-cream-100 px-2 py-1.5 font-medium text-warm-700">
                  {pname}
                </td>
                {catchers.map(([cid]) => {
                  const cell = lookup.get(`${pid}:${cid}`);
                  if (!cell) {
                    return (
                      <td key={cid} className="px-2 py-1.5 text-center text-warm-300">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={cid} className="px-1 py-1 text-center">
                      <div
                        className={cn(
                          'mx-auto flex w-16 flex-col items-center rounded-lg px-1 py-1',
                          cell.thinSample ? 'bg-warm-100' : '',
                        )}
                        style={
                          cell.thinSample || cell.strikeRate === null
                            ? undefined
                            : { background: greenHeat(cell.strikeRate) }
                        }
                      >
                        <span
                          className={cn(
                            'text-micro font-semibold tabular-nums',
                            !cell.thinSample && cell.strikeRate !== null && cell.strikeRate > 0.55
                              ? 'text-white'
                              : 'text-warm-800',
                          )}
                        >
                          {cell.strikeRate === null ? '—' : `${Math.round(cell.strikeRate * 100)}%`}
                        </span>
                        <span className="text-micro text-warm-500">{cell.innings} ip</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StatVisualFrame>
  );
}

// =============================================================================
// Defensive Event Map
// =============================================================================

const DEF_RESULT_COLOR: Record<DefensiveEventPoint['result'], string> = {
  out: '#16A34A',
  hit: '#a8a29e',
  error: '#dc2626',
  unknown: '#d6d3d1',
};
const DEF_RESULT_LABEL: Record<DefensiveEventPoint['result'], string> = {
  out: 'Out',
  hit: 'Hit',
  error: 'Error',
  unknown: 'Unknown',
};

export interface DefensiveEventMapProps {
  points: DefensiveEventPoint[];
  sources?: StatVisualSourceChip[];
  onPointActivate?: (ids: string[]) => void;
  height?: number;
  className?: string;
}

export function DefensiveEventMap({
  points,
  sources,
  onPointActivate,
  height = 320,
  className,
}: DefensiveEventMapProps) {
  const [ctx, setCtx] = React.useState<BaseballDataContext | null>(null);
  const allContexts = React.useMemo(() => uniqueContexts(points.map((p) => p.context)), [points]);
  const valid = React.useMemo(
    () =>
      points.filter(
        (p) => p.fieldX !== null && p.fieldY !== null && (ctx === null || p.context === ctx),
      ),
    [points, ctx],
  );
  const gate = gateSample(valid.length, { read: 8, trend: 25 });

  const size = Math.min(height - 28, 300);
  const px = (x: number) => x * size;
  const py = (y: number) => y * size;

  const legend: LegendItem[] = (Object.keys(DEF_RESULT_COLOR) as DefensiveEventPoint['result'][])
    .filter((r) => valid.some((p) => p.result === r))
    .map((r) => ({ key: r, label: DEF_RESULT_LABEL[r], color: DEF_RESULT_COLOR[r] }));

  const table: StatVisualTableData = {
    caption: 'Per defensive event: position, result and context.',
    columns: [
      { key: 'pos', label: 'Position' },
      { key: 'result', label: 'Result' },
      { key: 'context', label: 'Context' },
    ],
    rows: valid.map((p) => ({
      pos: p.position ?? '—',
      result: DEF_RESULT_LABEL[p.result],
      context: p.context,
    })),
  };

  return (
    <StatVisualFrame
      title="Defensive events"
      subtitle="Where are defensive problems or strengths?"
      overline="Defense"
      sources={sources}
      dataContexts={ctx ? [ctx] : allContexts}
      sample={{ size: valid.length, unitLabel: 'events', confidence: gate.confidence, minForRead: 8 }}
      tableData={table}
      height={height}
      className={className}
      actions={<ContextSplitFilter available={allContexts} value={ctx} onChange={setCtx} />}
    >
      <div className="flex h-full items-center justify-center">
        <svg width={size} height={size} role="presentation">
          {/* outfield + infield */}
          <path
            d={`M ${px(0.5)} ${py(0.95)} L ${px(0.05)} ${py(0.4)} A ${px(0.45)} ${px(0.45)} 0 0 1 ${px(0.95)} ${py(0.4)} Z`}
            className="fill-primary-50/60 stroke-warm-300"
            strokeWidth={1}
          />
          <polygon
            points={`${px(0.5)},${py(0.95)} ${px(0.68)},${py(0.7)} ${px(0.5)},${py(0.5)} ${px(0.32)},${py(0.7)}`}
            className="fill-warm-100 stroke-warm-300"
            strokeWidth={1}
          />
          {valid.map((p) => (
            <circle
              key={p.id}
              cx={px(p.fieldX as number)}
              cy={py(p.fieldY as number)}
              r={4}
              fill={DEF_RESULT_COLOR[p.result]}
              fillOpacity={0.85}
              stroke="white"
              strokeWidth={0.5}
              className={p.source && onPointActivate ? 'cursor-pointer' : undefined}
              onClick={onPointActivate && p.source ? () => onPointActivate([p.id]) : undefined}
            >
              <title>{`${p.position ?? 'Fielder'} · ${DEF_RESULT_LABEL[p.result]}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <ChartLegend items={legend} className="mt-1 justify-center" />
    </StatVisualFrame>
  );
}

// =============================================================================
// Baserunning Speed & Decision Board
// =============================================================================

export interface BaserunningBoardProps {
  rows: BaserunningRow[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

export function BaserunningBoard({ rows, sources, height = 320, className }: BaserunningBoardProps) {
  const gate = gateSample(rows.length, { read: 1, trend: 5 });
  // sort by 60 time asc (fastest first), nulls last
  const sorted = React.useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.sixtyTime === null) return 1;
        if (b.sixtyTime === null) return -1;
        return a.sixtyTime - b.sixtyTime;
      }),
    [rows],
  );

  const table: StatVisualTableData = {
    caption: 'Per player 60-yard time, home-to-first, first-to-third, SB/CS, baserunning outs.',
    columns: [
      { key: 'player', label: 'Player' },
      { key: 'sixty', label: '60', numeric: true },
      { key: 'h1', label: 'H-1B', numeric: true },
      { key: 'f3', label: '1B-3B', numeric: true },
      { key: 'sb', label: 'SB', numeric: true },
      { key: 'cs', label: 'CS', numeric: true },
      { key: 'outs', label: 'BR outs', numeric: true },
    ],
    rows: sorted.map((r) => ({
      player: r.playerName,
      sixty: num(r.sixtyTime, 2),
      h1: num(r.homeToFirst, 2),
      f3: num(r.firstToThird, 2),
      sb: r.stolenBases ?? 0,
      cs: r.caughtStealing ?? 0,
      outs: r.baserunningOuts ?? 0,
    })),
  };

  return (
    <StatVisualFrame
      title="Baserunning — speed & decisions"
      subtitle="Are speed and decisions helping or hurting?"
      overline="Baserunning"
      sources={sources}
      sample={{ size: rows.length, unitLabel: 'players', confidence: gate.confidence, minForRead: 1 }}
      tableData={table}
      height={height}
      className={className}
    >
      <div className="h-full overflow-auto">
        <div className="flex flex-col gap-1.5">
          {sorted.map((r) => {
            const sbTotal = (r.stolenBases ?? 0) + (r.caughtStealing ?? 0);
            const sbRate = sbTotal > 0 ? (r.stolenBases ?? 0) / sbTotal : null;
            return (
              <div key={r.playerId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-2 py-1 odd:bg-warm-50/50">
                <span className="truncate text-xs font-medium text-warm-700">{r.playerName}</span>
                <span className="text-xs tabular-nums text-warm-600">
                  {r.sixtyTime === null ? '— ' : `${num(r.sixtyTime, 2)}s`} 60
                </span>
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    sbRate === null ? 'text-warm-400' : sbRate >= 0.75 ? 'text-primary-600' : 'text-pursuit',
                  )}
                >
                  {r.stolenBases ?? 0}/{sbTotal} SB
                  {(r.baserunningOuts ?? 0) > 0 ? ` · ${r.baserunningOuts} outs` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </StatVisualFrame>
  );
}
