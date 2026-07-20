'use client';

/**
 * ============================================================================
 * SprayField — THE premium shot-dispersion instrument (driving + approach)
 * ----------------------------------------------------------------------------
 * Replaces the legacy `FairwayDrivingSpray` (driving-only) with a single field
 * that also plots approach shots. Top-down: lateral offset on x, "forward" on
 * y (up = farther). The two families read the SAME `{x,y}` fields from
 * `getSprayChartData` (stats-data.ts) very differently, so the vertical
 * projection is family-aware:
 *
 *   - driving:  y = the shot's actual forward carry (always >= 0). The origin
 *     (y = 0) IS the player/tee, so it anchors the BOTTOM of the field and
 *     forward distance reads straight up — a semicircular "range" framing.
 *   - approach: y = signed offset from the PIN (short shots negative, long
 *     positive) — there is no player-relative origin in this data at all, the
 *     shots are a miss-pattern AROUND the target. The origin marks the PIN and
 *     naturally sits near the vertical center of a symmetric domain, short
 *     misses below it, long misses above.
 *
 * A faint 5-cell "cross" of sector wedges (left/center/right x short/long,
 * dropping the 4 diagonal blends for a clean instrument, not a crowded 3x3
 * grid) shades by that sector's summaryBands percentage on the accent ramp;
 * the dominantSector gets a hairline accent outline. Distance rings are
 * horizontal hairlines (not literal circles — the lateral and forward domains
 * have very different magnitudes, so true circles would render as ellipses)
 * at "nice" yardage steps. Dots are colored by outcome bucket and individually
 * focusable/hoverable for a ChartTooltip readout of `point.tooltip`.
 *
 * The short/center/long WEDGE ROW boundaries are placed using the ACTUAL
 * observed forward span of the plotted points (`computeForwardRowDomain`),
 * not the full render axis. For approach the two already coincide (the axis
 * is naturally centered on the pin at 0, and misses spread symmetrically
 * around it). For driving they do NOT: the render axis floors at the tee
 * (0), but real drives cluster near their own distance, nowhere close to 0 —
 * bucketing thirds of the full `[0, forwardMax]` axis would put "short"
 * drives in the "center" row and "center" drives in the "long" row (verified
 * numerically: a 220yd short drive plotting inside the center wedge). Row
 * placement is decoupled from the axis so the wedge tint tracks the dots.
 *
 * HONEST: no group / zero points → a centered empty note, never a fabricated
 * plot (mirrors FairwayDrivingSpray's contract).
 * ========================================================================== */

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ChartTooltip } from './ChartTooltip';
import { TABULAR_NUMS, VIZ_CHROME, VIZ_COLOR } from './theme';
import type {
  SprayChartOutcomeBucket,
  SprayChartShotFamily,
  SprayChartShotGroup,
  SprayChartSummaryBand,
} from '@/app/golf/actions/stats-data-types';

export interface SprayFieldProps {
  group: SprayChartShotGroup | null;
  family: SprayChartShotFamily;
  /** Optional height/sizing class applied to the root instrument panel. */
  heightClass?: string;
}

/* ---------------------------------------------------------------------------
 * Pure geometry / scale helpers — exported for the colocated unit tests.
 * ------------------------------------------------------------------------- */

const VIEW_W = 320;
const VIEW_H = 340;
const PAD_X = 22;
const PAD_TOP = 24;
const PAD_BOTTOM = 34;
const PLOT_L = PAD_X;
const PLOT_R = VIEW_W - PAD_X;
const PLOT_T = PAD_TOP;
const PLOT_B = VIEW_H - PAD_BOTTOM;
const CX = (PLOT_L + PLOT_R) / 2;
const ENTRANCE_MS = 360;

export interface SprayBounds {
  lateralMax: number;
  forwardMax: number;
}

/** Symmetric-padded domain bounds from the plotted points, family-aware. */
export function computeSprayBounds(
  points: ReadonlyArray<{ x: number; y: number }>,
  family: SprayChartShotFamily,
): SprayBounds {
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (const p of points) {
    if (Number.isFinite(p.x)) maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
    if (Number.isFinite(p.y)) maxAbsY = Math.max(maxAbsY, Math.abs(p.y));
  }
  const lateralFloor = 8;
  const forwardFloor = family === 'driving' ? 20 : 8;
  return {
    lateralMax: Math.max(lateralFloor, maxAbsX) * 1.18,
    forwardMax: Math.max(forwardFloor, maxAbsY) * 1.18,
  };
}

/** driving: [0, max] (origin = tee, at the bottom). approach: [-max, max] (origin = pin). */
export function sprayForwardDomain(
  family: SprayChartShotFamily,
  forwardMax: number,
): [number, number] {
  return family === 'driving' ? [0, forwardMax] : [-forwardMax, forwardMax];
}

/** Tiny hand-rolled linear scale (no visx dependency needed at this point count). */
export function makeLinearScale(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (value: number) => {
    if (span === 0) return (r0 + r1) / 2;
    const t = (value - d0) / span;
    return r0 + t * (r1 - r0);
  };
}

const RING_STEPS = [5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250];

/** Smallest "nice" step from RING_STEPS that yields roughly `targetCount` rings. */
export function computeDistanceRingStep(maxValue: number, targetCount = 4): number {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return RING_STEPS[0]!;
  const raw = maxValue / targetCount;
  for (const step of RING_STEPS) {
    if (step >= raw) return step;
  }
  return RING_STEPS[RING_STEPS.length - 1]!;
}

/** Ring values (data units) from one step up to maxValue, inclusive. */
export function computeDistanceRings(maxValue: number, targetCount = 4): number[] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return [];
  const step = computeDistanceRingStep(maxValue, targetCount);
  const rings: number[] = [];
  for (let v = step; v <= maxValue + 1e-6; v += step) {
    rings.push(Math.round(v));
  }
  return rings;
}

/** The 5 sectors rendered as wedges (drops the 4 diagonal blends for a clean cross). */
export type CardinalSector = 'left' | 'center' | 'right' | 'short' | 'long';
export const CARDINAL_SPRAY_SECTORS: readonly CardinalSector[] = [
  'long',
  'left',
  'center',
  'right',
  'short',
];

export interface WedgeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type SectorWedgeGeometry = Record<CardinalSector, WedgeRect>;
export interface PlotBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The forward-domain range used to place the short/center/long wedge ROW
 * boundaries — distinct from `sprayForwardDomain` (the full render axis).
 *
 * For 'approach', y is already a signed offset from the pin, symmetric and
 * centered on 0, so the full render axis IS the right domain to bucket into
 * thirds — return it unchanged.
 *
 * For 'driving', y is the shot's raw forward carry (always >= 0), and the
 * render axis floors at the tee (0) purely for the visual origin/rings — real
 * drives cluster near their own distance, never near 0. Bucketing thirds of
 * `[0, forwardMax]` would place short drives in the "center" row and center
 * drives in the "long" row (the bug this fixes). Using the ACTUAL observed
 * [min, max] of the plotted points' y values instead keeps the row bucketing
 * correlated with where the dots really are.
 */
export function computeForwardRowDomain(
  points: ReadonlyArray<{ y: number }>,
  family: SprayChartShotFamily,
  forwardMax: number,
): [number, number] {
  if (family === 'approach') return [-forwardMax, forwardMax];

  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (Number.isFinite(p.y)) {
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, forwardMax];
  return [min, max];
}

/**
 * A "plus/cross" of 5 rectangular wedges over a conceptual 3x3 grid (3 lateral
 * bands x 3 forward bands): center + its 4 orthogonal neighbors. The 4 corner
 * cells (the diagonal sector blends) are deliberately left blank — points that
 * belong to a diagonal sector still plot as real dots, they just don't get a
 * dedicated background wedge (keeps the field a clean 5-region instrument
 * instead of a crowded 3x3 grid).
 *
 * `rowDomain` (see `computeForwardRowDomain`) drives the short/center/long row
 * boundaries; it is deliberately separate from the `[fD0, fD1]` axis domain
 * used for the pixel scale itself, since for driving those two ranges differ.
 */
export function computeSectorWedgeRects(
  bounds: SprayBounds,
  family: SprayChartShotFamily,
  plot: PlotBox,
  rowDomain: [number, number],
): SectorWedgeGeometry {
  const { lateralMax, forwardMax } = bounds;
  const xScale = makeLinearScale([-lateralMax, lateralMax], [plot.left, plot.right]);
  const [fD0, fD1] = sprayForwardDomain(family, forwardMax);
  const yScale = makeLinearScale([fD0, fD1], [plot.bottom, plot.top]);

  const colBoundary = lateralMax / 3;
  const xL = xScale(-colBoundary);
  const xR = xScale(colBoundary);

  const [rowD0, rowD1] = rowDomain;
  const rowSpan = rowD1 - rowD0;
  const yNear = yScale(rowD0 + rowSpan / 3);
  const yFar = yScale(rowD1 - rowSpan / 3);

  const rect = (x0: number, x1: number, y0: number, y1: number): WedgeRect => ({
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  });

  return {
    center: rect(xL, xR, yFar, yNear),
    left: rect(plot.left, xL, yFar, yNear),
    right: rect(xR, plot.right, yFar, yNear),
    long: rect(xL, xR, plot.top, yFar),
    short: rect(xL, xR, yNear, plot.bottom),
  };
}

const SECTOR_RAMP_MIN_OPACITY = 0.05;
const SECTOR_RAMP_MAX_OPACITY = 0.5;

/** A sector's summaryBands percentage (0-100) → wedge fill opacity on the accent ramp. */
export function sectorRampOpacity(pct: number | null | undefined): number {
  if (pct === null || pct === undefined || !Number.isFinite(pct) || pct <= 0) return 0;
  const clamped = Math.max(0, Math.min(100, pct));
  return SECTOR_RAMP_MIN_OPACITY + (SECTOR_RAMP_MAX_OPACITY - SECTOR_RAMP_MIN_OPACITY) * (clamped / 100);
}

/** outcomeBucket → the token color a dot renders in (never a raw hex). */
export function sprayOutcomeColor(bucket: SprayChartOutcomeBucket): string {
  switch (bucket) {
    case 'penalty':
      return VIZ_COLOR.danger;
    case 'trouble':
      return VIZ_COLOR.warning;
    case 'playable':
    default:
      return VIZ_COLOR.accent;
  }
}

/** The figure's `role="img"` aria-label — the ONE non-interactive AT channel. */
export function buildSprayAriaSummary(
  group: SprayChartShotGroup | null,
  family: SprayChartShotFamily,
): string {
  const familyLabel = family === 'driving' ? 'Driving' : 'Approach';
  if (!group || group.points.length === 0) {
    return `${familyLabel} spray chart. No shots plotted yet.`;
  }
  const n = group.points.length;
  const dominant = group.summaryBands.find((b) => b.sector === group.dominantSector);
  const parts = [`${familyLabel} spray chart. ${n} shot${n === 1 ? '' : 's'} plotted.`];
  if (dominant && dominant.count > 0) {
    parts.push(`Most land ${dominant.label.toLowerCase()} (${Math.round(dominant.percentage)}%).`);
  }
  if (group.averageForwardDistance != null) {
    parts.push(`Average forward distance ${Math.round(group.averageForwardDistance)} yards.`);
  }
  if (group.averageRemainingDistance != null) {
    parts.push(`Average remaining ${Math.round(group.averageRemainingDistance)} yards.`);
  }
  return parts.join(' ');
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export function SprayField({ group, family, heightClass }: SprayFieldProps) {
  const reduced = useReducedMotion() ?? false;
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Memoized so a stable reference feeds the dependent useMemo hooks below —
  // `group?.points ?? []` would otherwise mint a new empty-array identity on
  // every render whenever `group` is null, invalidating every memo downstream.
  const points = React.useMemo(() => group?.points ?? [], [group]);

  const bounds = React.useMemo(() => computeSprayBounds(points, family), [points, family]);
  const forwardDomain = React.useMemo(
    () => sprayForwardDomain(family, bounds.forwardMax),
    [family, bounds.forwardMax],
  );
  const xScale = React.useMemo(
    () => makeLinearScale([-bounds.lateralMax, bounds.lateralMax], [PLOT_L, PLOT_R]),
    [bounds.lateralMax],
  );
  const yScale = React.useMemo(
    () => makeLinearScale(forwardDomain, [PLOT_B, PLOT_T]),
    [forwardDomain],
  );
  const rowDomain = React.useMemo(
    () => computeForwardRowDomain(points, family, bounds.forwardMax),
    [points, family, bounds.forwardMax],
  );
  const wedges = React.useMemo(
    () =>
      computeSectorWedgeRects(
        bounds,
        family,
        { left: PLOT_L, right: PLOT_R, top: PLOT_T, bottom: PLOT_B },
        rowDomain,
      ),
    [bounds, family, rowDomain],
  );
  const rings = React.useMemo(() => computeDistanceRings(bounds.forwardMax), [bounds.forwardMax]);
  const ariaSummary = React.useMemo(() => buildSprayAriaSummary(group, family), [group, family]);

  const cardinalBands = React.useMemo(() => {
    if (!group) return [] as SprayChartSummaryBand[];
    const bySector = new Map(group.summaryBands.map((b) => [b.sector, b] as const));
    return CARDINAL_SPRAY_SECTORS.map((sector) => bySector.get(sector)).filter(
      (b): b is SprayChartSummaryBand => Boolean(b),
    );
  }, [group]);

  if (!group || points.length === 0) {
    return (
      <div
        role="img"
        aria-label={ariaSummary}
        style={heightClass ? undefined : { minHeight: 280 }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border-subtle bg-inset p-6 text-center',
          heightClass,
        )}
      >
        <span className="font-fw-sans text-body-sm font-medium text-text-secondary">
          {family === 'driving' ? 'No tee-shot spray yet' : 'No approach spray yet'}
        </span>
        <span className="font-fw-sans text-caption font-normal text-text-tertiary">
          Log rounds with shot direction and the spray pattern fills in here.
        </span>
      </div>
    );
  }

  const n = points.length;
  const originY = yScale(0);
  const originLabel = family === 'driving' ? 'YOU' : 'PIN';
  const activePoint = points.find((p) => p.id === activeId) ?? null;
  const activeCx = activePoint ? xScale(activePoint.x) : 0;
  const activeCy = activePoint ? yScale(activePoint.y) : 0;
  const clearActive = (id: string) => setActiveId((cur) => (cur === id ? null : cur));

  return (
    <div
      data-slot="spray-field"
      className={cn(
        'flex w-full flex-col gap-4 rounded-card border border-border-subtle bg-surface-sunken p-4 sm:p-5',
        heightClass,
      )}
    >
      {/* header — count + avg readouts */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-fw-sans text-caption font-medium text-text-secondary">
          {n} shot{n === 1 ? '' : 's'} plotted
        </span>
        <div className="flex items-baseline gap-4">
          <StatReadout label="Avg forward" value={group.averageForwardDistance} />
          <StatReadout label="Avg remaining" value={group.averageRemainingDistance} />
        </div>
      </div>

      {/* the field */}
      <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={ariaSummary}
          className="block h-full w-full overflow-visible"
        >
          {/* distance rings — horizontal hairlines (not circles: the lateral vs
              forward domains differ too much in magnitude for a true circle) */}
          {rings.map((r) => {
            const yTop = yScale(r);
            const yBottom = family === 'approach' ? yScale(-r) : null;
            return (
              <g key={r}>
                <line x1={PLOT_L} x2={PLOT_R} y1={yTop} y2={yTop} stroke={VIZ_CHROME.grid} strokeWidth={1} />
                <text
                  x={PLOT_R}
                  y={yTop - 3}
                  textAnchor="end"
                  className="font-fw-mono text-microbadge tabular-nums"
                  fill={VIZ_COLOR.textTertiary}
                >
                  {r}y
                </text>
                {yBottom !== null ? (
                  <>
                    <line x1={PLOT_L} x2={PLOT_R} y1={yBottom} y2={yBottom} stroke={VIZ_CHROME.grid} strokeWidth={1} />
                    <text
                      x={PLOT_R}
                      y={yBottom - 3}
                      textAnchor="end"
                      className="font-fw-mono text-microbadge tabular-nums"
                      fill={VIZ_COLOR.textTertiary}
                    >
                      {r}y
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}

          {/* the 5-cell sector cross — faint accent-ramp wedges */}
          {cardinalBands.map((band) => {
            const rect = wedges[band.sector as CardinalSector];
            if (!rect || rect.width <= 0 || rect.height <= 0) return null;
            const isDominant = band.count > 0 && band.sector === group.dominantSector;
            return (
              <rect
                key={band.sector}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill={VIZ_COLOR.accent}
                fillOpacity={sectorRampOpacity(band.percentage)}
                stroke={isDominant ? VIZ_COLOR.accent : 'none'}
                strokeOpacity={isDominant ? 0.55 : 0}
                strokeWidth={isDominant ? 1.25 : 0}
              />
            );
          })}

          {/* target line + origin marker (player for driving, pin for approach) */}
          <line
            x1={CX}
            x2={CX}
            y1={PLOT_T}
            y2={PLOT_B}
            stroke={VIZ_CHROME.benchmark}
            strokeWidth={1.25}
            strokeDasharray="5 4"
          />
          <circle cx={CX} cy={originY} r={4} fill={VIZ_COLOR.accent} stroke={VIZ_COLOR.surface} strokeWidth={1.5} />
          <text
            x={CX}
            y={family === 'driving' ? originY + 15 : originY - 9}
            textAnchor="middle"
            className="font-fw-sans text-microbadge uppercase"
            fill={VIZ_COLOR.textTertiary}
          >
            {originLabel}
          </text>

          {/* shot dots — density-aware ink, focusable + hoverable */}
          <motion.g
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { duration: ENTRANCE_MS / 1000 }}
          >
            {points.map((p) => {
              const cx = xScale(p.x);
              const cy = yScale(p.y);
              const isActive = p.id === activeId;
              return (
                <circle
                  key={p.id}
                  cx={cx}
                  cy={cy}
                  r={isActive ? 4.4 : 3.2}
                  fill={sprayOutcomeColor(p.outcomeBucket)}
                  fillOpacity={0.7}
                  stroke={isActive ? VIZ_COLOR.textPrimary : 'none'}
                  strokeWidth={isActive ? 1.5 : 0}
                  tabIndex={0}
                  role="button"
                  aria-label={p.tooltip}
                  className={cn(
                    'cursor-pointer outline-none transition-[fill-opacity,r] [transition-duration:180ms]',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700',
                  )}
                  onMouseEnter={() => setActiveId(p.id)}
                  onMouseLeave={() => clearActive(p.id)}
                  onFocus={() => setActiveId(p.id)}
                  onBlur={() => clearActive(p.id)}
                />
              );
            })}
          </motion.g>
        </svg>

        {activePoint ? (
          <div
            className="pointer-events-none absolute z-tooltip -translate-x-1/2 -translate-y-[calc(100%+8px)]"
            style={{ left: `${(activeCx / VIEW_W) * 100}%`, top: `${(activeCy / VIEW_H) * 100}%` }}
          >
            <ChartTooltip heading={activePoint.tooltip} rows={[]} />
          </div>
        ) : null}
      </div>

      {/* compact sector strip — 5 cells, label · n · pct% */}
      <div className="grid grid-cols-5 gap-1.5 border-t border-border-subtle pt-3">
        {cardinalBands.map((band) => {
          const isDominant = band.count > 0 && band.sector === group.dominantSector;
          return (
            <div
              key={band.sector}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-fw-sm px-1 py-1.5 text-center',
                isDominant && 'bg-accent-50',
              )}
            >
              <span className="truncate font-fw-sans text-eyebrow uppercase text-text-tertiary">
                {band.label}
              </span>
              <span
                style={TABULAR_NUMS}
                className={cn(
                  'font-fw-mono text-caption font-semibold',
                  isDominant ? 'text-accent-700' : 'text-text-primary',
                )}
              >
                {band.count} · {Math.round(band.percentage)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatReadout({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-right">
      <div style={TABULAR_NUMS} className="font-fw-mono text-body-sm font-semibold text-text-primary">
        {value != null ? `${Math.round(value)}y` : '—'}
      </div>
      <div className="font-fw-sans text-eyebrow uppercase text-text-tertiary">{label}</div>
    </div>
  );
}
