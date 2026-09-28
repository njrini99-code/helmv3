'use client';

/**
 * CoachHelm Home · cause visual for "Off the tee": where drives finish.
 *
 * One dot per tracked drive, drawn in the zone it finished in (fairway, left
 * rough, right rough). Where the dot sits inside its zone is a deterministic
 * jitter seeded by the shot's index in the payload, so a dot never jumps when
 * a filter changes. Its height is the measured drive length when the slice
 * has one; drives without a length are drawn hollow. Penalties and misses with
 * no side tagged have no honest place on the hole, so they sit in a strip
 * under it instead.
 *
 * Every figure comes from `teeSummary` over the slice's shots; nothing here is
 * estimated.
 */
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { EmptyState } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { inRounds, teeSummary } from '@/lib/golf/team-intelligence/aggregate';
import type { TeeShot, TeeZone } from '@/lib/golf/team-intelligence/types';
import { formatPct, type CauseProps } from '../shared';

// ---------------------------------------------------------------------------
// Geometry (viewBox units)
// ---------------------------------------------------------------------------

const W = 400;
const H = 320;
const CX = 200;
/** The yard scale maps onto this band: longest drives up top. */
const Y_FAR = 44;
const Y_NEAR = 232;
const FAIRWAY_END = 268;
/** Rough dots stay inside the tree-line strips at either edge. */
const ROUGH_MIN = 28;
const ROUGH_MAX = 372;
/** Narrowest yard window the scale will draw (one drive, or all the same). */
const MIN_SPAN_YD = 40;

/**
 * Turf, mixed from tokens into the card surface so the hole reads in both
 * themes: pale cream-greens in light, deep muted greens in dark.
 */
const TURF = {
  rough: 'color-mix(in oklab, var(--fw-viz-seq-3) 22%, var(--fw-color-surface))',
  trees: 'color-mix(in oklab, var(--fw-viz-seq-3) 34%, var(--fw-color-surface))',
  fairwayA: 'color-mix(in oklab, var(--fw-viz-seq-3) 46%, var(--fw-color-surface))',
  fairwayB: 'color-mix(in oklab, var(--fw-viz-seq-3) 40%, var(--fw-color-surface))',
  edge: 'color-mix(in oklab, var(--fw-viz-seq-3) 64%, var(--fw-color-surface))',
  tee: 'color-mix(in oklab, var(--fw-viz-seq-3) 56%, var(--fw-color-surface))',
  guide: 'color-mix(in oklab, var(--fw-color-text-primary) 22%, transparent)',
  avg: 'color-mix(in oklab, var(--fw-color-text-primary) 62%, transparent)',
} as const;

const ZONE_COLOR: Record<TeeZone, string> = {
  fairway: 'var(--fw-color-accent-ink)',
  left: 'var(--fw-viz-div-neg)',
  right: 'var(--fw-viz-div-neg)',
  miss: 'var(--fw-color-warning)',
  penalty: 'var(--fw-color-danger)',
};

const ZONE_LABEL: Record<TeeZone, string> = {
  left: 'Left rough',
  fairway: 'Fairway',
  right: 'Right rough',
  miss: 'Missed, no side',
  penalty: 'Penalty',
};

const LEGEND_ORDER: readonly TeeZone[] = ['left', 'fairway', 'right', 'miss', 'penalty'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r1 = (v: number): number => Math.round(v * 10) / 10;

/** A percent string for an overlay position; never "NaN%". */
function at(v: number, total: number): string {
  return Number.isFinite(v) ? `${Math.round((v / total) * 10000) / 100}%` : '0%';
}

/** Deterministic 0..1 from an integer seed (a small integer hash). */
function hash01(seed: number): number {
  let t = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Fairway half-width at a viewBox y: widest in the landing zone, narrowing
 *  toward the tee. */
function halfWidth(y: number): number {
  if (y <= 100) return 42 + 10 * Math.sin((Math.PI / 2) * (Math.max(0, y) / 100));
  return 18 + 34 * Math.cos((Math.PI / 2) * Math.min(1, (y - 100) / 176));
}

const FAIRWAY_PATH = (() => {
  const ys: number[] = [];
  for (let y = 0; y < FAIRWAY_END; y += 12) ys.push(y);
  ys.push(FAIRWAY_END);
  const left = ys.map((y) => `${r1(CX - halfWidth(y))} ${y}`);
  const right = [...ys].reverse().map((y) => `${r1(CX + halfWidth(y))} ${y}`);
  return `M${left.join(' L')} L${right.join(' L')} Z`;
})();

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const lo = sorted[base]!;
  const hi = sorted[Math.min(sorted.length - 1, base + 1)]!;
  return lo + (hi - lo) * (pos - base);
}

interface YardScale {
  y: (yards: number) => number;
  guides: number[];
}

/** A yard axis over the slice's measured drives (5th to 95th percentile, at
 *  least `MIN_SPAN_YD` wide so one drive never divides by zero). Outliers clamp
 *  to the edges. */
function yardScale(yards: readonly number[]): YardScale | null {
  if (yards.length === 0) return null;
  const sorted = [...yards].sort((a, b) => a - b);
  const p05 = quantile(sorted, 0.05);
  const p95 = quantile(sorted, 0.95);
  const mid = (p05 + p95) / 2;
  const span = Math.max(MIN_SPAN_YD, p95 - p05 + 20);
  const lo = Math.floor((mid - span / 2) / 10) * 10;
  const hi = Math.ceil((mid + span / 2) / 10) * 10;
  const step = hi - lo <= 80 ? 20 : hi - lo <= 160 ? 40 : 50;
  const guides: number[] = [];
  for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) if (g > lo) guides.push(g);
  return {
    y: (v) => Y_NEAR - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (Y_NEAR - Y_FAR),
    guides,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** HTML label pinned to a viewBox point, so text stays a true 12px at any
 *  drawing scale. */
function Tag({
  x,
  y,
  align = 'center',
  above = false,
  children,
  className,
}: {
  x: number;
  y: number;
  align?: 'start' | 'center' | 'end';
  above?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const style: CSSProperties = { top: at(y, H) };
  if (align === 'end') style.right = at(W - x, W);
  else style.left = at(x, W);
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute whitespace-nowrap font-fw-sans text-caption leading-none text-text-secondary',
        align === 'center' && '-translate-x-1/2',
        above ? '-translate-y-full pb-1' : '-translate-y-1/2',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

function Header({ who, figure }: { who: string; figure: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-fw-display text-h3 font-semibold text-text-primary">Where drives finish</h3>
        <p className="truncate font-fw-sans text-caption text-text-tertiary">{who}</p>
      </div>
      {figure}
    </div>
  );
}

function OffMapDots({ count, zone }: { count: number; zone: 'penalty' | 'miss' }) {
  const shown = Math.min(count, 12);
  return (
    <span aria-hidden className="flex flex-wrap items-center gap-1">
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          className={cn('size-2 rounded-full', zone === 'miss' && 'border border-fw-warning bg-surface')}
          style={zone === 'penalty' ? { background: ZONE_COLOR.penalty } : undefined}
        />
      ))}
      {count > shown ? <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">+{count - shown}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TeeCause
// ---------------------------------------------------------------------------

interface TeeDot {
  key: number;
  zone: 'fairway' | 'left' | 'right';
  x: number;
  y: number;
  measured: boolean;
}

export function TeeCause({ data, allowed, playerId, playerName, className }: CauseProps) {
  const svgId = `tee-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Global index per shot: the jitter seed, stable across every filter.
  const indexOf = useMemo(() => new Map<TeeShot, number>(data.tee.map((s, i) => [s, i])), [data.tee]);
  const shots = useMemo(() => inRounds(data.tee, allowed, data.rounds, playerId), [data.tee, allowed, data.rounds, playerId]);
  const summary = useMemo(() => teeSummary(shots), [shots]);

  const plot = useMemo(() => {
    const onMap = shots.filter(
      (s): s is TeeShot & { zone: TeeDot['zone'] } => s.zone === 'fairway' || s.zone === 'left' || s.zone === 'right',
    );
    const measuredYards = onMap.map((s) => s.yards).filter((y): y is number => y != null && Number.isFinite(y) && y > 0);
    const scale = yardScale(measuredYards);
    const dots: TeeDot[] = onMap.map((s) => {
      const i = indexOf.get(s) ?? 0;
      const u = hash01(i * 2 + 1);
      const v = hash01(i * 2 + 2);
      const measured = scale != null && s.yards != null && Number.isFinite(s.yards) && s.yards > 0;
      const y = measured ? scale.y(s.yards!) : Y_FAR + 16 + v * (Y_NEAR - Y_FAR - 32);
      const hw = halfWidth(y);
      let x: number;
      if (s.zone === 'fairway') x = CX + (u * 2 - 1) * Math.max(4, hw - 9);
      else if (s.zone === 'left') x = ROUGH_MIN + u * (CX - hw - 12 - ROUGH_MIN);
      else x = CX + hw + 12 + u * (ROUGH_MAX - (CX + hw + 12));
      return { key: i, zone: s.zone, x: r1(x), y: r1(y), measured };
    });
    return { dots, scale, unmeasured: dots.filter((d) => !d.measured).length };
  }, [shots, indexOf]);

  const who = playerName ?? 'Whole team';
  const n = summary.n;

  if (n === 0) {
    return (
      <section
        aria-label="Where drives finish"
        className={cn('flex min-w-0 flex-col gap-2 rounded-card border border-border-subtle bg-surface p-4 sm:p-5', className)}
      >
        <Header who={who} figure={null} />
        <EmptyState
          variant="subtle"
          title="No tee shots tracked in these rounds"
          description="Drives show up here once rounds are entered shot by shot."
        />
      </section>
    );
  }

  const { zones, avgYards, fairwayPct, missSide } = summary;
  const avg = avgYards != null && Number.isFinite(avgYards) ? Math.round(avgYards) : null;
  const share = (count: number) => (count / n) * 100;
  const dotR = plot.dots.length > 80 ? 3.6 : plot.dots.length > 30 ? 4.4 : 5.4;
  const avgY = plot.scale && avg != null ? plot.scale.y(avg) : null;
  const legend = LEGEND_ORDER.filter((z) => z !== 'miss' || zones.miss > 0);

  const figure =
    avg != null ? (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">{avg} yd</span>
        <span className="font-fw-sans text-caption text-text-tertiary">avg drive</span>
        <span className="rounded-full bg-accent-wash px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums text-accent-ink">
          {formatPct(fairwayPct)} fairways
        </span>
      </div>
    ) : (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">{formatPct(fairwayPct)}</span>
        <span className="font-fw-sans text-caption text-text-tertiary">fairways hit</span>
        {zones.penalty > 0 ? (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums text-text-secondary">
            {plural(zones.penalty, 'penalty', 'penalties')}
          </span>
        ) : null}
      </div>
    );

  const ariaLabel =
    `${plural(n, 'drive', 'drives')}: ${zones.fairway} in the fairway, ${zones.left} in the left rough, ` +
    `${zones.right} in the right rough` +
    (zones.miss > 0 ? `, ${zones.miss} missed with no side tagged` : '') +
    `, ${plural(zones.penalty, 'penalty', 'penalties')}.`;

  return (
    <section
      aria-label="Where drives finish"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
        className,
      )}
    >
      <Header who={`${who} · ${plural(n, 'drive', 'drives')}`} figure={figure} />

      <div className="flex flex-col gap-2">
        <div className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-fw-md" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="absolute inset-0 block size-full">
            <defs>
              <pattern id={`${svgId}-mow`} width={W} height={24} patternUnits="userSpaceOnUse">
                <rect width={W} height={12} style={{ fill: TURF.fairwayA }} />
                <rect y={12} width={W} height={12} style={{ fill: TURF.fairwayB }} />
              </pattern>
            </defs>
            <rect width={W} height={H} style={{ fill: TURF.rough }} />
            <rect width={18} height={H} style={{ fill: TURF.trees }} />
            <rect x={W - 18} width={18} height={H} style={{ fill: TURF.trees }} />
            <path d={FAIRWAY_PATH} fill={`url(#${svgId}-mow)`} />
            <path d={FAIRWAY_PATH} fill="none" style={{ stroke: TURF.edge }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <rect
              x={188}
              y={282}
              width={24}
              height={14}
              rx={3}
              style={{ fill: TURF.tee, stroke: TURF.edge }}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />

            {plot.scale?.guides.map((g) => {
              const y = r1(plot.scale!.y(g));
              return (
                <line
                  key={g}
                  x1={18}
                  x2={W - 18}
                  y1={y}
                  y2={y}
                  style={{ stroke: TURF.guide }}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {avgY != null ? (
              <line
                x1={18}
                x2={W - 18}
                y1={r1(avgY)}
                y2={r1(avgY)}
                style={{ stroke: TURF.avg }}
                strokeWidth={1.25}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            <g>
              {plot.dots.map((d) => (
                <circle
                  key={d.key}
                  cx={d.x}
                  cy={d.y}
                  r={dotR}
                  data-zone={d.zone}
                  data-measured={d.measured ? 'true' : 'false'}
                  style={
                    d.measured
                      ? { fill: ZONE_COLOR[d.zone], stroke: 'var(--fw-color-surface)' }
                      : { fill: 'var(--fw-color-surface)', stroke: ZONE_COLOR[d.zone] }
                  }
                  strokeWidth={d.measured ? 2 : 1.75}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          </svg>

          {plot.scale?.guides.map((g) => (
            <Tag key={g} x={24} y={plot.scale!.y(g)} align="start" above>
              {g} yd
            </Tag>
          ))}
          {avgY != null ? (
            <Tag x={W - 24} y={avgY} align="end" above className="font-semibold text-text-primary">
              Avg
            </Tag>
          ) : null}
          <Tag x={82} y={302}>
            Left rough
          </Tag>
          <Tag x={318} y={302}>
            Right rough
          </Tag>
        </div>

        <p className="font-fw-sans text-caption text-text-tertiary">
          <span>Dots sit in the zone each drive finished in.</span>{' '}
          {plot.scale ? (
            <span>
              Height is the measured drive length
              {plot.unmeasured > 0 ? '; hollow dots had no length measured.' : '.'}
            </span>
          ) : plot.dots.length === 0 ? null : avg != null ? (
            <span>None of the drives on the map had a measured length.</span>
          ) : (
            <span>No drive lengths were measured in this slice.</span>
          )}
        </p>
      </div>

      {zones.penalty + zones.miss > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-fw-md bg-surface-sunken px-3 py-2 font-fw-sans text-caption text-text-secondary">
          <span className="font-medium text-text-tertiary">Not on the map</span>
          {zones.penalty > 0 ? (
            <span className="inline-flex items-center gap-2" data-offmap="penalty">
              <OffMapDots count={zones.penalty} zone="penalty" />
              <span>
                <span className="font-semibold tabular-nums text-text-primary">{zones.penalty}</span>{' '}
                {zones.penalty === 1 ? 'penalty' : 'penalties'}
              </span>
            </span>
          ) : null}
          {zones.miss > 0 ? (
            <span className="inline-flex items-center gap-2" data-offmap="miss">
              <OffMapDots count={zones.miss} zone="miss" />
              <span>
                <span className="font-semibold tabular-nums text-text-primary">{zones.miss}</span> missed with no side tagged
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
          {legend
            .filter((z) => zones[z] > 0)
            .map((z) => (
              <span key={z} className="h-full" style={{ width: `${r1(share(zones[z]))}%`, background: ZONE_COLOR[z] }} />
            ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {legend.map((z) => {
            const lead = (z === 'left' || z === 'right') && z === missSide;
            return (
              <li key={z} data-legend={z} className="inline-flex items-center gap-1.5 font-fw-sans text-caption">
                <span
                  aria-hidden
                  className={cn('size-2 rounded-full', z === 'miss' && 'border border-fw-warning bg-surface')}
                  style={z === 'miss' ? undefined : { background: ZONE_COLOR[z] }}
                />
                <span className={lead ? 'font-semibold text-text-primary' : 'text-text-secondary'}>{ZONE_LABEL[z]}</span>
                <span className="font-semibold tabular-nums text-text-primary">{formatPct(share(zones[z]))}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
