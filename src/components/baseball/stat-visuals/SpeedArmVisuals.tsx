'use client';

// =============================================================================
// src/components/baseball/stat-visuals/SpeedArmVisuals.tsx
//
// W6e — two new premium SVG stat visuals:
//
//   ArmBoard          — arm-strength scatter: throw distance (ft) vs velocity
//                       (mph), colored by position group.  SVG up to the spec's
//                       aggregate threshold; hexbin above it.  Honest empty
//                       states: only real points plotted, ≥3 required for a
//                       readable chart.  Fully wrapped in <StatVisualFrame> with
//                       source chips, table fallback, and insufficient-data guard.
//
//   SpeedDecisionBoard — per-player sprint splits + decision efficiency.  The
//                        efficiency column is HONEST: null renders as "—" when
//                        fewer than 3 decisions have been captured; the frame
//                        surface shows the "sample too small" state for the
//                        whole board when < 1 player has data.  Includes a
//                        visual bar for decision efficiency and an SVG spark for
//                        the 60-time ranking.
//
// DESIGN: cream/green StatVisualFrame; warm position-group colours (never
// off-palette neon); position groups always labeled, never color-only.
// Context filter (ContextSplitFilter) for the ArmBoard when multiple contexts
// are present.  Table fallback mandatory on both charts.
//
// HONESTY RULES enforced here:
//   - null coordinates are dropped before rendering; never coerced to (0,0).
//   - Empty state (no points at all) and insufficient-data state (< minForRead)
//     surface through the StatVisualFrame honesty contract.
//   - Decision efficiency is withheld when totalDecisions < 3 — "—" not "0%".
//   - SVG is used for < 200 points; the frame shifts to hexbin aggregate mode
//     above 200 (reuses chart-geometry hexbin helper).
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
  BulletBar,
  type LegendItem,
} from './chart-primitives';
import {
  linearScale,
  niceDomain,
  gateSample,
  hexbin,
  scatterRenderMode,
  num,
  pct,
} from './chart-geometry';
import type { ArmBoardPoint, SpeedDecisionRow } from '@/lib/types/baseball-stat-visuals';
import type { BaseballDataContext } from '@/lib/types/baseball-stat-events';

// ---------------------------------------------------------------------------
// Position-group colour palette (warm, on-brand — no neon)
// ---------------------------------------------------------------------------

const POSITION_COLOR: Record<ArmBoardPoint['positionGroup'], string> = {
  infield:  '#16A34A', // primary-600 green
  outfield: '#78716c', // warm-500
  catcher:  '#d97706', // amber-600 (warm complement)
  pitcher:  '#a8a29e', // warm-400
  other:    '#d6d3d1', // warm-300
};

const POSITION_SHAPE: Record<ArmBoardPoint['positionGroup'], LegendItem['shape']> = {
  infield:  'circle',
  outfield: 'square',
  catcher:  'diamond',
  pitcher:  'triangle',
  other:    'circle',
};

const POSITION_LABEL: Record<ArmBoardPoint['positionGroup'], string> = {
  infield:  'Infield',
  outfield: 'Outfield',
  catcher:  'Catcher',
  pitcher:  'Pitcher',
  other:    'Other',
};

// Min samples for the ArmBoard (distance × velocity scatter).
const ARM_THRESHOLDS = { read: 3, trend: 15, aggregate: 200 };

// ---------------------------------------------------------------------------
// ArmBoard
// ---------------------------------------------------------------------------

export interface ArmBoardProps {
  points: ArmBoardPoint[];
  sources?: StatVisualSourceChip[];
  onPointActivate?: (ids: string[]) => void;
  height?: number;
  className?: string;
}

/**
 * Arm-strength scatter: throw distance (ft) on X, throw velocity (mph) on Y.
 * Glyph shape encodes position group; labeled legend ensures it is never
 * color-only.  Insufficient-data surface when fewer than 3 real data points.
 */
export function ArmBoard({
  points,
  sources,
  onPointActivate,
  height = 320,
  className,
}: ArmBoardProps) {
  const [ref, width] = useMeasuredWidth();
  const [ctx, setCtx] = React.useState<BaseballDataContext | null>(null);

  // Contexts present in the data — drive the optional context filter.
  const allContexts = React.useMemo(
    () => [...new Set(points.map((p) => p.context))],
    [points],
  );

  // Filter to selected context and drop null coords.
  const valid = React.useMemo(
    () =>
      points.filter(
        (p) =>
          p.throwDistance !== null &&
          p.throwVelocity !== null &&
          (ctx === null || p.context === ctx),
      ),
    [points, ctx],
  );

  const gate = gateSample(valid.length, ARM_THRESHOLDS);
  const renderMode = scatterRenderMode(valid.length, ARM_THRESHOLDS);

  const domainX = niceDomain(valid.map((p) => p.throwDistance), 0.06, [0, 300]);
  const domainY = niceDomain(valid.map((p) => p.throwVelocity), 0.06, [50, 100]);

  const innerW = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const innerH = Math.max(0, height - PLOT_MARGIN.top - PLOT_MARGIN.bottom - 28); // room for legend

  const sx = linearScale(domainX, [PLOT_MARGIN.left, PLOT_MARGIN.left + innerW]);
  const sy = linearScale(domainY, [PLOT_MARGIN.top + innerH, PLOT_MARGIN.top], true);

  // Aggregated hexbin when above the scatter threshold.
  const bins = React.useMemo(() => {
    if (renderMode !== 'aggregate') return [];
    return hexbin(
      valid.map((p) => ({ id: p.id, x: p.throwDistance, y: p.throwVelocity })),
      domainX,
      domainY,
    );
  }, [valid, renderMode, domainX, domainY]);

  const maxBinCount = React.useMemo(() => Math.max(1, ...bins.map((b) => b.count)), [bins]);

  // Present position groups for the legend (only groups that appear).
  const presentGroups = React.useMemo(
    () =>
      (Object.keys(POSITION_COLOR) as ArmBoardPoint['positionGroup'][]).filter((g) =>
        valid.some((p) => p.positionGroup === g),
      ),
    [valid],
  );

  const legend: LegendItem[] = presentGroups.map((g) => ({
    key: g,
    label: POSITION_LABEL[g],
    color: POSITION_COLOR[g],
    shape: POSITION_SHAPE[g],
  }));

  const table: StatVisualTableData = {
    caption:
      'Per throw: player, position group, distance, velocity, context, and date.',
    columns: [
      { key: 'player', label: 'Player' },
      { key: 'group', label: 'Position' },
      { key: 'dist', label: 'Distance (ft)', numeric: true },
      { key: 'velo', label: 'Velo (mph)', numeric: true },
      { key: 'ctx', label: 'Context' },
      { key: 'date', label: 'Date' },
    ],
    rows: valid.map((p) => ({
      player: p.playerName,
      group: POSITION_LABEL[p.positionGroup],
      dist: num(p.throwDistance, 0),
      velo: num(p.throwVelocity, 1),
      ctx: p.context,
      date: p.date ?? '—',
    })),
  };

  return (
    <StatVisualFrame
      title="Arm strength"
      subtitle="Throw distance vs velocity — are arms translating power to the field?"
      overline="Arm / Defense"
      sources={sources}
      dataContexts={ctx ? [ctx] : allContexts}
      sample={{
        size: valid.length,
        unitLabel: 'throws',
        confidence: gate.confidence,
        minForRead: ARM_THRESHOLDS.read,
      }}
      tableData={table}
      height={height}
      className={className}
      actions={
        <ContextSplitFilter available={allContexts} value={ctx} onChange={setCtx} />
      }
    >
      <div ref={ref} className="flex h-full flex-col">
        <svg
          width={width}
          height={height - 28}
          className="overflow-visible"
          role="presentation"
        >
          {/* Gridlines — subtle warm, not distracting. */}
          {makeTicks(domainY[0], domainY[1], sy, 4).map((t) => (
            <line
              key={`gy-${t.value}`}
              x1={PLOT_MARGIN.left}
              x2={PLOT_MARGIN.left + innerW}
              y1={t.pos}
              y2={t.pos}
              stroke="var(--color-warm-200, #e7e5e4)"
              strokeWidth={1}
            />
          ))}

          <AxisY
            x={PLOT_MARGIN.left}
            y0={PLOT_MARGIN.top + innerH}
            y1={PLOT_MARGIN.top}
            ticks={makeTicks(domainY[0], domainY[1], sy, 4)}
            format={(v) => `${v.toFixed(0)}`}
            label="Velo (mph)"
          />

          <AxisX
            y={PLOT_MARGIN.top + innerH}
            x0={PLOT_MARGIN.left}
            x1={PLOT_MARGIN.left + innerW}
            ticks={makeTicks(domainX[0], domainX[1], sx, 5)}
            format={(v) => `${v.toFixed(0)}'`}
            label="Distance (ft)"
          />

          {/* Render: hexbin aggregate (dense) or individual scatter. */}
          {renderMode === 'aggregate'
            ? bins.map((bin, i) => {
                const r = 4 + (bin.count / maxBinCount) * 10;
                const opacity = 0.55 + (bin.count / maxBinCount) * 0.45;
                return (
                  <circle
                    key={i}
                    cx={sx(bin.cx)}
                    cy={sy(bin.cy)}
                    r={r}
                    fill="#16A34A"
                    fillOpacity={opacity}
                    stroke="white"
                    strokeWidth={0.5}
                    className={onPointActivate ? 'cursor-pointer' : undefined}
                    onClick={onPointActivate ? () => onPointActivate(bin.ids) : undefined}
                  >
                    <title>{`${bin.count} throws`}</title>
                  </circle>
                );
              })
            : valid.map((p) => {
                const cx = sx(p.throwDistance!);
                const cy = sy(p.throwVelocity!);
                const color = POSITION_COLOR[p.positionGroup];
                const shape = POSITION_SHAPE[p.positionGroup];
                return (
                  <ScatterGlyph
                    key={p.id}
                    cx={cx}
                    cy={cy}
                    shape={shape ?? 'circle'}
                    color={color}
                    label={`${p.playerName} · ${num(p.throwDistance, 0)} ft · ${num(p.throwVelocity, 1)} mph`}
                    onClick={
                      onPointActivate
                        ? () => onPointActivate([p.id])
                        : undefined
                    }
                  />
                );
              })}
        </svg>

        <ChartLegend items={legend} className="mt-1 px-1" />
      </div>
    </StatVisualFrame>
  );
}

// ---------------------------------------------------------------------------
// SpeedDecisionBoard
// ---------------------------------------------------------------------------

export interface SpeedDecisionBoardProps {
  rows: SpeedDecisionRow[];
  sources?: StatVisualSourceChip[];
  height?: number;
  className?: string;
}

// Minimum decisions before we show an efficiency value.
const MIN_DECISIONS_FOR_EFFICIENCY = 3;

/**
 * Sprint splits + decision efficiency per player. The 60-time bar ranks players
 * fastest-to-slowest; the efficiency column is honest (null when fewer than 3
 * decisions have been captured). Includes a table fallback.
 */
export function SpeedDecisionBoard({
  rows,
  sources,
  height = 340,
  className,
}: SpeedDecisionBoardProps) {
  const gate = gateSample(rows.length, { read: 1, trend: 5 });

  // Sort ascending 60 time (fastest first), nulls last.
  const sorted = React.useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.sixtyTime === null) return 1;
        if (b.sixtyTime === null) return -1;
        return a.sixtyTime - b.sixtyTime;
      }),
    [rows],
  );

  // 60-time domain for the ranking spark.
  const sixtys = rows.map((r) => r.sixtyTime).filter((v): v is number => v !== null);
  const bestSixty = sixtys.length > 0 ? Math.min(...sixtys) : 6.0;
  const worstSixty = sixtys.length > 0 ? Math.max(...sixtys) : 7.5;

  const table: StatVisualTableData = {
    caption:
      'Per player: 60-yard time, home-to-first, first-to-third, stolen base attempts, decision efficiency.',
    columns: [
      { key: 'player', label: 'Player' },
      { key: 'sixty', label: '60', numeric: true },
      { key: 'h1', label: 'H-1B', numeric: true },
      { key: 'f3', label: '1B-3B', numeric: true },
      { key: 'sb', label: 'SB', numeric: true },
      { key: 'cs', label: 'CS', numeric: true },
      { key: 'eff', label: 'Decision %', numeric: true },
    ],
    rows: sorted.map((r) => {
      const showEff =
        typeof r.totalDecisions === 'number' &&
        r.totalDecisions >= MIN_DECISIONS_FOR_EFFICIENCY;
      return {
        player: r.playerName,
        sixty: num(r.sixtyTime, 2),
        h1: num(r.homeToFirst, 2),
        f3: num(r.firstToThird, 2),
        sb: r.stolenBases ?? 0,
        cs: r.caughtStealing ?? 0,
        eff: showEff ? pct(r.decisionEfficiency) : '—',
      };
    }),
  };

  // Derive an overall decision efficiency note for the subtitle.
  const playersWithEff = rows.filter(
    (r) =>
      typeof r.totalDecisions === 'number' &&
      r.totalDecisions >= MIN_DECISIONS_FOR_EFFICIENCY &&
      r.decisionEfficiency !== null,
  );

  return (
    <StatVisualFrame
      title="Speed & decisions"
      subtitle="Sprint splits ranked fastest to slowest; decision efficiency requires ≥3 attempts."
      overline="Baserunning"
      sources={sources}
      sample={{
        size: rows.length,
        unitLabel: 'players',
        confidence: gate.confidence,
        minForRead: 1,
      }}
      tableData={table}
      height={height}
      className={className}
    >
      <div className="flex h-full flex-col">
        {/* Column headers */}
        <div className="mb-1.5 grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem_5rem] items-center gap-2 px-1">
          <span className="text-micro font-semibold uppercase tracking-wide text-warm-400">
            Player
          </span>
          <span className="text-right text-micro font-semibold uppercase tracking-wide text-warm-400">
            60
          </span>
          <span className="text-right text-micro font-semibold uppercase tracking-wide text-warm-400">
            H–1B
          </span>
          <span className="text-right text-micro font-semibold uppercase tracking-wide text-warm-400">
            1B–3B
          </span>
          <span className="text-right text-micro font-semibold uppercase tracking-wide text-warm-400">
            Decision
          </span>
        </div>

        {/* Player rows */}
        <div className="flex flex-1 flex-col gap-1 overflow-auto">
          {sorted.map((r) => {
            // 60-time bar: low time = full bar (inverted: faster = more bar).
            const sixtyPct =
              r.sixtyTime !== null && worstSixty > bestSixty
                ? 1 - (r.sixtyTime - bestSixty) / (worstSixty - bestSixty)
                : null;

            // Decision efficiency — withhold for thin samples.
            const showEff =
              typeof r.totalDecisions === 'number' &&
              r.totalDecisions >= MIN_DECISIONS_FOR_EFFICIENCY;
            const eff = showEff ? r.decisionEfficiency : null;
            const effTone: 'primary' | 'amber' | 'warm' =
              eff === null
                ? 'warm'
                : eff >= 0.7
                  ? 'primary'
                  : eff >= 0.5
                    ? 'amber'
                    : 'warm';

            // SB context label.
            const sbTotal = (r.stolenBases ?? 0) + (r.caughtStealing ?? 0);

            return (
              <div
                key={r.playerId}
                className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem_5rem] items-center gap-2 rounded-lg px-1 py-1.5 odd:bg-warm-50/60"
              >
                {/* Name + 60 bar */}
                <div className="min-w-0">
                  <span className="block truncate text-xs font-medium text-warm-800">
                    {r.playerName}
                  </span>
                  {/* Tiny 60-bar under the name (fastest = longest green bar) */}
                  {sixtyPct !== null ? (
                    <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-warm-100">
                      <div
                        className="h-full rounded-full bg-primary-500 transition-[width] duration-300"
                        style={{ width: `${sixtyPct * 100}%` }}
                        role="img"
                        aria-label={`60-yard rank: ${Math.round(sixtyPct * 100)}%`}
                      />
                    </div>
                  ) : (
                    <div className="mt-0.5 h-1 w-full rounded-full bg-warm-100" />
                  )}
                </div>

                {/* 60 time */}
                <span className="text-right text-xs tabular-nums text-warm-700">
                  {num(r.sixtyTime, 2)}
                </span>

                {/* Home to first */}
                <span className="text-right text-xs tabular-nums text-warm-600">
                  {num(r.homeToFirst, 2)}
                </span>

                {/* First to third */}
                <span className="text-right text-xs tabular-nums text-warm-600">
                  {num(r.firstToThird, 2)}
                </span>

                {/* Decision efficiency */}
                <div className="flex flex-col items-end gap-0.5">
                  {showEff && eff !== null ? (
                    <>
                      <span
                        className={cn(
                          'text-xs font-semibold tabular-nums',
                          effTone === 'primary'
                            ? 'text-primary-600'
                            : effTone === 'amber'
                              ? 'text-amber-600'
                              : 'text-warm-400',
                        )}
                      >
                        {pct(eff)}
                      </span>
                      <BulletBar
                        value={eff}
                        max={1}
                        tone={effTone}
                        height={4}
                      />
                      {sbTotal > 0 ? (
                        <span className="text-micro text-warm-400">
                          {r.stolenBases ?? 0}/{sbTotal} sb
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span
                      className="text-xs text-warm-300"
                      title={
                        typeof r.totalDecisions === 'number' && r.totalDecisions > 0
                          ? `Only ${r.totalDecisions} decision${r.totalDecisions === 1 ? '' : 's'} — need ${MIN_DECISIONS_FOR_EFFICIENCY} for a read`
                          : 'No baserunning decisions captured yet'
                      }
                    >
                      —
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note when some players lack efficiency data */}
        {playersWithEff.length < rows.length && rows.length > 0 ? (
          <p className="mt-1.5 px-1 text-micro leading-snug text-warm-400">
            Decision % shown only when ≥{MIN_DECISIONS_FOR_EFFICIENCY} attempts captured.
          </p>
        ) : null}
      </div>
    </StatVisualFrame>
  );
}

// ---------------------------------------------------------------------------
// Internal: scatter glyph renderer (shape-by-position for a11y + color-by-group)
// ---------------------------------------------------------------------------

function ScatterGlyph({
  cx,
  cy,
  shape,
  color,
  label,
  onClick,
}: {
  cx: number;
  cy: number;
  shape: 'circle' | 'square' | 'triangle' | 'diamond';
  color: string;
  label: string;
  onClick?: () => void;
}) {
  const r = 5;
  const common = {
    fill: color,
    fillOpacity: 0.8,
    stroke: 'white',
    strokeWidth: 0.5,
    onClick,
    className: onClick ? 'cursor-pointer' : undefined,
  };

  return (
    <g>
      {shape === 'circle' && <circle cx={cx} cy={cy} r={r} {...common} />}
      {shape === 'square' && (
        <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1} {...common} />
      )}
      {shape === 'triangle' && (
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`}
          {...common}
        />
      )}
      {shape === 'diamond' && (
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          {...common}
        />
      )}
      <title>{label}</title>
    </g>
  );
}
