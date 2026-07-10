'use client';

/**
 * ============================================================================
 * FairwayDrivingSpray — the premium off-the-tee spray chart (driving directions)
 * ----------------------------------------------------------------------------
 * Replaces the flat canvas ShotDispersion for driving with a glass landing-view:
 * a frosted plot panel, a glowing intended-target line, an honest 1σ dispersion
 * ellipse (gradient fill), shot landings colored by outcome (fairway / trouble /
 * penalty), the player's mean-bias marker, and a left·center·right distribution
 * bar with a plain-English tendency takeaway.
 *
 * HONEST (house rule): plots ONLY real points from the SprayChartShotGroup. No
 * points → a calm InsufficientData state, never fabricated coordinates. The
 * ellipse only draws with ≥3 shots. The left/center/right split is the
 * server-assigned sector, not a guessed fairway width.
 *
 * Pure SVG (not canvas) so the gradients, glow, and glass highlight render crisp
 * at any DPR and theme-react to the `--fw-*` tokens. Driving spray is modest in
 * volume (tens–hundreds of tee shots), so SVG node count is a non-issue.
 * ========================================================================== */

import * as React from 'react';
// Deep imports (NOT the big `@/components/fairway` barrel): a new leaf component
// pulled into the cockpit's chunk via the barrel triggers a Turbopack circular-
// init ("module factory is not available"). Import the primitives directly.
import { Surface } from '@/components/fairway/surfaces/surface';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';
import type {
  SprayChartShotGroup,
  SprayChartPoint,
  SprayChartSector,
} from '@/app/golf/actions/stats-data-types';

/* Tokens (resolved inside the `.fairway-ds` scope). */
const ACCENT = 'var(--fw-color-accent-500)';
const WARNING = 'var(--fw-color-warning)';
const DANGER = 'var(--fw-color-danger)';
const GRID = 'var(--fw-viz-grid)';
const BENCH = 'var(--fw-viz-benchmark)';
const SURFACE = 'var(--fw-color-surface)';

type LateralFamily = 'left' | 'center' | 'right';

const LATERAL_FAMILY: Record<SprayChartSector, LateralFamily> = {
  left: 'left',
  short_left: 'left',
  long_left: 'left',
  right: 'right',
  short_right: 'right',
  long_right: 'right',
  center: 'center',
  short: 'center',
  long: 'center',
};

/** Humanized "where the misses lean" line, keyed by dominant sector. */
const SECTOR_TAKEAWAY: Record<string, string> = {
  center: 'Tee shots tend to find the short grass',
  left: 'Misses lean left',
  right: 'Misses lean right',
  short: 'Tee shots tend to come up short',
  long: 'Tee shots tend to run long',
  short_left: 'Misses lean short-left',
  short_right: 'Misses lean short-right',
  long_left: 'Misses lean long-left',
  long_right: 'Misses lean long-right',
};

function outcomeColor(o: SprayChartPoint['outcomeBucket']): string {
  return o === 'penalty' ? DANGER : o === 'trouble' ? WARNING : ACCENT;
}

interface Stats {
  meanX: number;
  meanY: number;
  sdX: number;
  sdY: number;
  cov: number;
}

function computeStats(pts: ReadonlyArray<{ x: number; y: number }>): Stats {
  const n = pts.length;
  if (n === 0) return { meanX: 0, meanY: 0, sdX: 0, sdY: 0, cov: 0 };
  const meanX = pts.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.y, 0) / n;
  let vx = 0;
  let vy = 0;
  let cov = 0;
  for (const p of pts) {
    vx += (p.x - meanX) ** 2;
    vy += (p.y - meanY) ** 2;
    cov += (p.x - meanX) * (p.y - meanY);
  }
  const denom = Math.max(1, n - 1);
  return { meanX, meanY, sdX: Math.sqrt(vx / denom), sdY: Math.sqrt(vy / denom), cov: cov / denom };
}

/* Plot geometry (viewBox units). */
const W = 320;
const H = 344;
const PAD_X = 20;
const PAD_TOP = 20;
const PAD_BOTTOM = 30;
const PLOT_L = PAD_X;
const PLOT_R = W - PAD_X;
const PLOT_T = PAD_TOP;
const PLOT_B = H - PAD_BOTTOM;
const CX = (PLOT_L + PLOT_R) / 2;

/** Build the 1σ covariance ellipse as a projected SVG path (anisotropic-safe:
 *  the two axes use different scales, so we sample in data space and project
 *  each sample through xs/ys rather than emitting one rotated <ellipse>). */
function ellipsePath(
  stats: Stats,
  xs: (v: number) => number,
  ys: (v: number) => number,
  nSigma: number,
): string {
  const { meanX, meanY, sdX, sdY, cov } = stats;
  const vX = sdX * sdX;
  const vY = sdY * sdY;
  const tr = vX + vY;
  const det = vX * vY - cov * cov;
  const disc = Math.max(0, (tr / 2) ** 2 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  const l2 = tr / 2 - Math.sqrt(disc);
  const theta = Math.abs(cov) < 1e-9 && vX >= vY ? 0 : Math.atan2(l1 - vX, cov || 1e-9);
  const ax = nSigma * Math.sqrt(Math.max(0, l1));
  const ay = nSigma * Math.sqrt(Math.max(0, l2));
  const steps = 56;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ex = ax * Math.cos(t);
    const ey = ay * Math.sin(t);
    const dx = ex * Math.cos(theta) - ey * Math.sin(theta);
    const dy = ex * Math.sin(theta) + ey * Math.cos(theta);
    d += `${i === 0 ? 'M' : 'L'}${xs(meanX + dx).toFixed(1)} ${ys(meanY + dy).toFixed(1)} `;
  }
  return `${d}Z`;
}

function Header({ takeaway }: { takeaway: string | null }) {
  return (
    <div className="min-w-0 flex flex-col gap-0.5">
      <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-accent-700">
        Off the tee
      </span>
      <h3 className="truncate font-fw-display text-h3 font-semibold tracking-[-0.01em] text-text-primary">
        Driving spray
      </h3>
      <p className="font-fw-sans text-caption text-text-tertiary">
        {takeaway ?? 'Where your tee shots land — lateral direction vs the intended line.'}
      </p>
    </div>
  );
}

export interface FairwayDrivingSprayProps {
  group: SprayChartShotGroup | null;
  className?: string;
}

export function FairwayDrivingSpray({ group, className }: FairwayDrivingSprayProps) {
  const reactId = React.useId();
  const points = React.useMemo(() => group?.points ?? [], [group]);
  const n = points.length;

  const model = React.useMemo(() => {
    if (n === 0) return null;
    let maxLat = 0;
    let maxDist = 0;
    let left = 0;
    let center = 0;
    let right = 0;
    for (const p of points) {
      maxLat = Math.max(maxLat, Math.abs(p.x));
      maxDist = Math.max(maxDist, Math.abs(p.y));
      const fam = LATERAL_FAMILY[p.sector] ?? 'center';
      if (fam === 'left') left += 1;
      else if (fam === 'right') right += 1;
      else center += 1;
    }
    const latMax = Math.max(8, maxLat) * 1.18;
    const distMax = Math.max(8, maxDist) * 1.18;
    const stats = computeStats(points);
    return { latMax, distMax, stats, left, center, right };
  }, [points, n]);

  const takeaway =
    n > 0 && group?.dominantSector ? SECTOR_TAKEAWAY[group.dominantSector] ?? null : null;

  // ── Honest empty state — no fabricated chart when there are no plotted shots.
  if (!group || n === 0 || !model) {
    return (
      <Surface elevation="border" padding="lg" className={className}>
        <div className="flex flex-col gap-4">
          <Header takeaway={null} />
          <InsufficientData
            compact
            title="No tee-shot spray yet"
            description="Log rounds with tee-shot directions and your driving spray pattern fills in here."
            unit="rounds"
          />
        </div>
      </Surface>
    );
  }

  const { latMax, distMax, stats, left, center, right } = model;
  const xs = (v: number) => CX + (v / latMax) * ((PLOT_R - PLOT_L) / 2);
  const ys = (v: number) => PLOT_B - ((v + distMax) / (2 * distMax)) * (PLOT_B - PLOT_T);

  const total = left + center + right;
  const pct = (c: number) => (total > 0 ? Math.round((c / total) * 100) : 0);
  const dominantMiss = left === right ? null : left > right ? 'left' : 'right';
  const avgCarry =
    group.averageForwardDistance != null && Number.isFinite(group.averageForwardDistance)
      ? Math.round(group.averageForwardDistance)
      : null;

  // Accessible one-line summary (screen readers get the gist without the SVG).
  const ariaSummary =
    `Driving spray: ${n} tee shot${n === 1 ? '' : 's'} plotted. ` +
    `${pct(center)}% center, ${pct(left)}% left, ${pct(right)}% right.` +
    (avgCarry != null ? ` Average carry ${avgCarry} yards.` : '') +
    (takeaway ? ` ${takeaway}.` : '');

  const gradId = `fw-spray-panel-${reactId}`;
  const ellId = `fw-spray-ell-${reactId}`;
  const glowId = `fw-spray-glow-${reactId}`;

  const dist = [
    { key: 'left', label: 'Left', count: left, color: dominantMiss === 'left' ? WARNING : 'var(--fw-color-text-tertiary)' },
    { key: 'center', label: 'Fairway line', count: center, color: ACCENT },
    { key: 'right', label: 'Right', count: right, color: dominantMiss === 'right' ? WARNING : 'var(--fw-color-text-tertiary)' },
  ] as const;

  const legend = [
    { label: 'Fairway', count: group.playableCount, color: ACCENT },
    { label: 'Trouble', count: group.troubleCount, color: WARNING },
    { label: 'Penalty', count: group.penaltyCount, color: DANGER },
  ].filter((l) => l.count > 0);

  return (
    <Surface elevation="border" padding="lg" className={className}>
      <div className="flex flex-col gap-5">
        {/* Phones (< sm): stack the header above the avg-carry readout instead
            of crowding them into one row — same fix as InstrumentPanel's
            bezel (doctrine rule 11). `sm:` and up restores the side-by-side
            header row. */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <Header takeaway={takeaway} />
          {avgCarry != null ? (
            <div className="w-full shrink-0 text-right sm:w-auto">
              <div className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">
                {avgCarry}
                <span className="ml-1 font-fw-sans text-caption font-medium text-text-tertiary">yds</span>
              </div>
              <div className="font-fw-sans text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                avg carry
              </div>
            </div>
          ) : null}
        </div>

        {/* ── The glass landing plot ─────────────────────────────────────────── */}
        <div className="mx-auto w-full max-w-[420px]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full"
            role="img"
            aria-label={ariaSummary}
          >
            <defs>
              {/* Frosted-glass vertical wash for the plot panel. */}
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                <stop offset="42%" stopColor="#ffffff" stopOpacity="0.14" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0.06" />
              </linearGradient>
              {/* 1σ ellipse fill — soft helm-green from the center out. */}
              <radialGradient id={ellId} cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0.06" />
              </radialGradient>
              <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="0.5" stdDeviation="1.1" floodColor="#1c1917" floodOpacity="0.18" />
              </filter>
            </defs>

            {/* glass panel */}
            <rect
              x={PLOT_L - 6}
              y={PLOT_T - 8}
              width={PLOT_R - PLOT_L + 12}
              height={PLOT_B - PLOT_T + 16}
              rx="16"
              fill={`url(#${gradId})`}
              stroke="var(--fw-color-border-subtle)"
              strokeWidth="1"
            />
            {/* top lit edge — the glass highlight */}
            <line
              x1={PLOT_L + 4}
              y1={PLOT_T - 7}
              x2={PLOT_R - 4}
              y2={PLOT_T - 7}
              stroke="#ffffff"
              strokeOpacity="0.6"
              strokeWidth="1"
              strokeLinecap="round"
            />

            {/* faint avg-carry baseline */}
            <line x1={PLOT_L} y1={ys(0)} x2={PLOT_R} y2={ys(0)} stroke={GRID} strokeWidth="1" />

            {/* intended target line (center) with a soft glow */}
            <line
              x1={CX}
              y1={PLOT_T - 2}
              x2={CX}
              y2={PLOT_B + 2}
              stroke={BENCH}
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />

            {/* 1σ dispersion ellipse */}
            {n >= 3 ? (
              <path
                d={ellipsePath(stats, xs, ys, 1)}
                fill={`url(#${ellId})`}
                stroke={ACCENT}
                strokeOpacity="0.45"
                strokeWidth="1.25"
              />
            ) : null}

            {/* shot landings, colored by outcome */}
            <g filter={`url(#${glowId})`}>
              {points.map((p) => (
                <circle
                  key={p.id}
                  cx={xs(p.x)}
                  cy={ys(p.y)}
                  r="3.4"
                  fill={outcomeColor(p.outcomeBucket)}
                  fillOpacity="0.82"
                />
              ))}
            </g>

            {/* mean-bias marker */}
            <circle cx={xs(stats.meanX)} cy={ys(stats.meanY)} r="6.5" fill={ACCENT} fillOpacity="0.16" />
            <circle
              cx={xs(stats.meanX)}
              cy={ys(stats.meanY)}
              r="4"
              fill={ACCENT}
              stroke={SURFACE}
              strokeWidth="1.75"
            />

            {/* axis hints */}
            <text x={PLOT_L} y={H - 10} fill="var(--fw-color-text-tertiary)" fontSize="9" fontWeight="600" letterSpacing="1.2">
              LEFT
            </text>
            <text x={PLOT_R} y={H - 10} textAnchor="end" fill="var(--fw-color-text-tertiary)" fontSize="9" fontWeight="600" letterSpacing="1.2">
              RIGHT
            </text>
            <text x={CX} y={H - 10} textAnchor="middle" fill="var(--fw-viz-axis)" fontSize="9" fontWeight="600" letterSpacing="1.2">
              TARGET
            </text>
          </svg>
        </div>

        {/* ── Direction split bar + chips ────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-sunken" role="presentation">
            {dist.map((d) =>
              d.count > 0 ? (
                <div
                  key={d.key}
                  style={{ width: `${pct(d.count)}%`, backgroundColor: d.color }}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                />
              ) : null,
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {dist.map((d) => (
              <div key={d.key} className="flex flex-col items-center gap-0.5">
                <span className="inline-flex items-center gap-1.5 font-fw-sans text-caption font-medium text-text-secondary">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.label}
                </span>
                <span className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">
                  {pct(d.count)}%
                  <span className="ml-1 font-fw-sans text-caption font-normal text-text-tertiary">
                    {d.count}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Outcome legend (only buckets that actually occurred) ───────────── */}
        {legend.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle pt-3">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.label}
                <span className="font-fw-mono font-medium tabular-nums text-text-secondary">{l.count}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}
