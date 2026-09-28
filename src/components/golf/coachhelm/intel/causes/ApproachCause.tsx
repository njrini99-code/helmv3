'use client';

/**
 * CoachHelm Home · cause visual for "Approach": where approaches finish.
 *
 * A pin plot for one distance band (or all of 75–200 yd). Each tagged miss is
 * drawn at its REAL spot as far as the data knows it: the radius is the
 * measured leave (ft) on the 10/20/30/40 ft rings, the angle is the exact
 * tagged direction of eight (long up, short down, diagonals at 45°). Misses at
 * the same direction and distance are nudged sideways by a few px, seeded by
 * the shot's index in the payload (never enough to leave their octant).
 *
 * Greens hit carry a distance but no direction, so they are a separate,
 * lighter layer: evenly spaced around the pin at their measured distance.
 * Misses with no direction tagged join that distance-only layer in a neutral
 * dashed style. Shots with no measured leave count in every figure but are
 * not drawn.
 *
 * Every figure comes from `approachSummary`; nothing here is estimated.
 */
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { EmptyState, PressTarget } from '@/components/fairway';
import { SEGMENTED_TRACK_SUNKEN_SHADOW, SegmentedPill } from '@/components/fairway/controls';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import {
  APPROACH_BANDS,
  APPROACH_MISSES,
  approachInBand,
  approachSummary,
  inRounds,
  mean,
  type ApproachBandId,
} from '@/lib/golf/team-intelligence/aggregate';
import type { ApproachMiss, ApproachShot } from '@/lib/golf/team-intelligence/types';
import { MISS_LABEL, formatFeet, formatPct, type CauseProps } from '../shared';

type Band = ApproachBandId | 'all';

// ---------------------------------------------------------------------------
// Geometry (viewBox units)
// ---------------------------------------------------------------------------

const W = 400;
const H = 340;
const PIN_X = 200;
const PIN_Y = 170;
/** Units per foot: rings at 10/20/30/40 ft sit at 22/44/66/88. */
const FT = 2.2;
/** Linear out to here; anything further sits in the labelled far band. */
const LINEAR_MAX_FT = 60;
const FAR_R = 142;
const FAR_IN = 134;
const FAR_OUT = 150;
const RINGS = [10, 20, 30, 40] as const;
/** Sideways nudge for stacked misses: a few px, and never past ±15° so a dot
 *  always stays inside its ±22.5° octant. */
const MAX_NUDGE = 7;
const MAX_SWING = (15 * Math.PI) / 180;
/** Ring labels and the avg label sit between the octant axes, where no
 *  tagged miss can land, on the side away from the flag. */
const RING_LABEL_DEG = -22.5;
const AVG_LABEL_DEG = 22.5;

/** Direction angles in SVG space (y grows down): right 0°, short 90°. */
const ANGLE: Record<ApproachMiss, number> = {
  right: 0,
  short_right: 45,
  short: 90,
  short_left: 135,
  left: 180,
  long_left: -135,
  long: -90,
  long_right: -45,
};

/** A band is amber when its leave per yard of approach is this much worse
 *  than the other bands pooled, with at least `FLAG_MIN_N` measured leaves on
 *  both sides. Normalising by distance keeps long bands from always looking
 *  worst. */
const FLAG_RATIO = 1.2;
const FLAG_MIN_N = 8;

/**
 * Turf, mixed from tokens into the card surface so the green reads in both
 * themes. The green is a soft halo with no hard edge: the plot's rings are
 * distances, and a drawn green edge would claim a boundary the data lacks.
 */
const TURF = {
  rough: 'color-mix(in oklab, var(--fw-viz-seq-3) 22%, var(--fw-color-surface))',
  fairwayA: 'color-mix(in oklab, var(--fw-viz-seq-3) 40%, var(--fw-color-surface))',
  fairwayB: 'color-mix(in oklab, var(--fw-viz-seq-3) 34%, var(--fw-color-surface))',
  green: 'color-mix(in oklab, var(--fw-viz-seq-3) 52%, var(--fw-color-surface))',
  greenMid: 'color-mix(in oklab, var(--fw-viz-seq-3) 38%, var(--fw-color-surface))',
  sand: 'color-mix(in oklab, var(--fw-color-warning) 22%, var(--fw-color-surface))',
  sandEdge: 'color-mix(in oklab, var(--fw-color-warning) 40%, var(--fw-color-surface))',
  ring: 'color-mix(in oklab, var(--fw-color-text-primary) 26%, transparent)',
  far: 'color-mix(in oklab, var(--fw-color-text-primary) 7%, transparent)',
  avg: 'color-mix(in oklab, var(--fw-color-text-primary) 62%, transparent)',
} as const;

const MISS_FILL = 'var(--fw-viz-div-neg)';
const GIR_FILL = 'color-mix(in oklab, var(--fw-color-accent-ink) 28%, var(--fw-color-surface))';
const GIR_STROKE = 'var(--fw-color-accent-ink)';
const UNTAGGED_STROKE = 'var(--fw-color-text-tertiary)';
const ROSE_REST = 'color-mix(in oklab, var(--fw-color-text-tertiary) 40%, var(--fw-color-surface))';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r1 = (v: number): number => Math.round(v * 10) / 10;
const rad = (deg: number): number => (deg * Math.PI) / 180;

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

function radiusOf(ft: number): number {
  return ft <= LINEAR_MAX_FT ? Math.max(0, ft) * FT : FAR_R;
}

function polar(r: number, deg: number): { x: number; y: number } {
  return { x: PIN_X + r * Math.cos(rad(deg)), y: PIN_Y + r * Math.sin(rad(deg)) };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const bandLabel = (band: Band): string =>
  band === 'all' ? '75–200' : (APPROACH_BANDS.find((b) => b.id === band)?.label ?? '75–200');

/** Bands whose leave per yard is `FLAG_RATIO`× the other bands pooled. */
function flaggedBands(shots: readonly ApproachShot[]): Set<ApproachBandId> {
  const ratio = (s: ApproachShot) => (s.leaveFeet != null && s.fromYards > 0 ? s.leaveFeet / s.fromYards : null);
  const ratios = (list: readonly ApproachShot[]) => list.map(ratio).filter((v): v is number => v != null && Number.isFinite(v));
  const out = new Set<ApproachBandId>();
  for (const band of APPROACH_BANDS) {
    const inside = ratios(approachInBand(shots, band.id));
    const others = ratios(APPROACH_BANDS.filter((b) => b.id !== band.id).flatMap((b) => approachInBand(shots, b.id)));
    if (inside.length < FLAG_MIN_N || others.length < FLAG_MIN_N) continue;
    const a = mean(inside);
    const o = mean(others);
    if (a != null && o != null && o > 0 && a >= o * FLAG_RATIO) out.add(band.id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plot model
// ---------------------------------------------------------------------------

type Layer = 'miss' | 'gir' | 'untagged';

interface PlotDot {
  key: number;
  layer: Layer;
  direction: ApproachMiss | null;
  x: number;
  y: number;
}

function missDot(key: number, direction: ApproachMiss, ft: number): PlotDot {
  const r = radiusOf(ft);
  const a = rad(ANGLE[direction]);
  const cap = Math.min(MAX_NUDGE, r * Math.tan(MAX_SWING));
  const t = (hash01(key * 2 + 1) * 2 - 1) * cap;
  // Tangent to the ring at angle a is (-sin a, cos a).
  return {
    key,
    layer: 'miss',
    direction,
    x: r1(PIN_X + r * Math.cos(a) - t * Math.sin(a)),
    y: r1(PIN_Y + r * Math.sin(a) + t * Math.cos(a)),
  };
}

/** Distance-only dots: grouped in 5 ft rings and spaced evenly around the pin
 *  at each shot's own measured distance, so the angle reads as "no data". */
function distanceOnlyDots(items: readonly { key: number; layer: 'gir' | 'untagged'; ft: number }[]): PlotDot[] {
  const bins = new Map<number, { key: number; layer: 'gir' | 'untagged'; ft: number }[]>();
  for (const it of items) {
    const b = Math.floor(Math.min(it.ft, LINEAR_MAX_FT + 1) / 5);
    const list = bins.get(b);
    if (list) list.push(it);
    else bins.set(b, [it]);
  }
  const out: PlotDot[] = [];
  for (const [b, list] of [...bins.entries()].sort((x, y) => x[0] - y[0])) {
    list.sort((p, q) => (p.layer === q.layer ? p.key - q.key : p.layer === 'gir' ? -1 : 1));
    const start = -112.5 + b * 41;
    list.forEach((it, j) => {
      const p = polar(radiusOf(it.ft), start + (j * 360) / list.length);
      out.push({ key: it.key, layer: it.layer, direction: null, x: r1(p.x), y: r1(p.y) });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** HTML label pinned to a viewBox point, so text stays a true 12px at any
 *  drawing scale. */
function Tag({
  x,
  y,
  w = W,
  h = H,
  align = 'center',
  children,
  className,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
  className?: string;
}) {
  const style: CSSProperties = { top: at(y, h) };
  if (align === 'end') style.right = at(w - x, w);
  else style.left = at(x, w);
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute -translate-y-1/2 whitespace-nowrap font-fw-sans text-caption leading-none text-text-secondary',
        align === 'center' && '-translate-x-1/2',
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
        <h3 className="font-fw-display text-h3 font-semibold text-text-primary">Where approaches finish</h3>
        <p className="truncate font-fw-sans text-caption text-text-tertiary">{who}</p>
      </div>
      {figure}
    </div>
  );
}

function GirSwatch() {
  return <span aria-hidden className="size-2.5 rounded-full border border-accent-ink" style={{ background: GIR_FILL }} />;
}
function MissSwatch() {
  return <span aria-hidden className="size-2.5 rounded-full" style={{ background: MISS_FILL }} />;
}
function UntaggedSwatch() {
  return <span aria-hidden className="size-2.5 rounded-full border border-dashed border-text-tertiary bg-surface" />;
}

const ROSE = 200;
const ROSE_C = 100;
const ROSE_R0 = 12;
const ROSE_R1 = 60;
const ROSE_LABEL_R = 82;

function wedgePath(deg: number, r: number): string {
  const a0 = rad(deg - 19);
  const a1 = rad(deg + 19);
  const p = (rr: number, a: number) => `${r1(ROSE_C + rr * Math.cos(a))} ${r1(ROSE_C + rr * Math.sin(a))}`;
  return `M${p(ROSE_R0, a0)} L${p(r, a0)} A${r1(r)} ${r1(r)} 0 0 1 ${p(r, a1)} L${p(ROSE_R0, a1)} A${ROSE_R0} ${ROSE_R0} 0 0 0 ${p(ROSE_R0, a0)} Z`;
}

/** Eight wedges, one per tagged direction, oriented like the pin plot (long
 *  up). Radius grows with the square root of the share so wedge AREA is
 *  proportional to it; the most common direction (every one, on a tie) is
 *  amber. */
function MissRose({ byDirection, missed }: { byDirection: Record<ApproachMiss, number>; missed: number }) {
  const max = Math.max(...APPROACH_MISSES.map((d) => byDirection[d]));
  const shares = APPROACH_MISSES.map((d) => ({ d, count: byDirection[d], share: missed > 0 ? byDirection[d] / missed : 0 }));
  const label = `Tagged misses by direction: ${shares.map((s) => `${MISS_LABEL[s.d]} ${formatPct(s.share * 100)}`).join(', ')}.`;
  const guide = ROSE_R0 + (ROSE_R1 - ROSE_R0) * Math.SQRT1_2;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[216px]">
      <svg viewBox={`0 0 ${ROSE} ${ROSE}`} role="img" aria-label={label} className="absolute inset-0 block size-full">
        <circle cx={ROSE_C} cy={ROSE_C} r={ROSE_R1} fill="none" style={{ stroke: TURF.ring }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <circle
          cx={ROSE_C}
          cy={ROSE_C}
          r={r1(guide)}
          fill="none"
          style={{ stroke: TURF.ring }}
          strokeWidth={1}
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
        {shares.map(({ d, count, share }) =>
          count > 0 ? (
            <path
              key={d}
              d={wedgePath(ANGLE[d], ROSE_R0 + (ROSE_R1 - ROSE_R0) * Math.sqrt(share))}
              data-direction={d}
              data-dominant={count === max ? 'true' : 'false'}
              style={{ fill: count === max ? 'var(--fw-color-warning)' : ROSE_REST }}
            />
          ) : null,
        )}
        <circle cx={ROSE_C} cy={ROSE_C} r={3} style={{ fill: 'var(--fw-color-text-primary)' }} />
      </svg>
      {shares.map(({ d, count, share }) => {
        const deg = ANGLE[d];
        const x = ROSE_C + ROSE_LABEL_R * Math.cos(rad(deg));
        const y = ROSE_C + ROSE_LABEL_R * Math.sin(rad(deg));
        const axis = d === 'long' || d === 'short' || d === 'left' || d === 'right';
        return (
          <span
            key={d}
            aria-hidden
            data-rose-label={d}
            className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center font-fw-sans text-caption leading-tight"
            style={{ left: at(x, ROSE), top: at(y, ROSE) }}
          >
            {axis ? <span className="text-text-tertiary">{capitalise(MISS_LABEL[d])}</span> : null}
            <span
              className={cn(
                'tabular-nums',
                count === max && count > 0 ? 'font-semibold text-fw-warning-text' : count > 0 ? 'text-text-secondary' : 'text-text-tertiary',
              )}
            >
              {formatPct(share * 100)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function missRead(byDirection: Record<ApproachMiss, number>, missed: number): string | null {
  if (missed === 0) return null;
  const max = Math.max(...APPROACH_MISSES.map((d) => byDirection[d]));
  const top = APPROACH_MISSES.filter((d) => byDirection[d] === max);
  const share = formatPct((max / missed) * 100);
  if (top.length === 1) return `The most common miss is ${MISS_LABEL[top[0]!]}: ${share} of tagged misses.`;
  return `${capitalise(listOf(top.map((d) => MISS_LABEL[d])))} tie as the most common miss: ${share} of tagged misses each.`;
}

// ---------------------------------------------------------------------------
// ApproachCause
// ---------------------------------------------------------------------------

export function ApproachCause({ data, allowed, playerId, playerName, className }: CauseProps) {
  const [band, setBand] = useState<Band>('all');
  const rawId = useId();
  const svgId = `app-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const reduced = useReducedMotionGuard() ?? false;

  // Global index per shot: the nudge seed, stable across every filter.
  const indexOf = useMemo(() => new Map<ApproachShot, number>(data.approach.map((s, i) => [s, i])), [data.approach]);
  const sliceShots = useMemo(
    () => inRounds(data.approach, allowed, data.rounds, playerId),
    [data.approach, allowed, data.rounds, playerId],
  );
  const allShots = useMemo(() => approachInBand(sliceShots, 'all'), [sliceShots]);
  const flagged = useMemo(() => flaggedBands(sliceShots), [sliceShots]);
  const options = useMemo(
    () =>
      [{ id: 'all' as Band, label: 'All' }, ...APPROACH_BANDS.map((b) => ({ id: b.id as Band, label: b.label }))].map((o) => ({
        ...o,
        proximity: approachSummary(o.id === 'all' ? allShots : approachInBand(sliceShots, o.id)).proximity,
      })),
    [allShots, sliceShots],
  );

  const shots = useMemo(() => (band === 'all' ? allShots : approachInBand(sliceShots, band)), [band, allShots, sliceShots]);
  const summary = useMemo(() => approachSummary(shots), [shots]);

  const plot = useMemo(() => {
    const misses: PlotDot[] = [];
    const distanceOnly: { key: number; layer: 'gir' | 'untagged'; ft: number }[] = [];
    let unplotted = 0;
    for (const s of shots) {
      const key = indexOf.get(s) ?? 0;
      if (s.leaveFeet == null || !Number.isFinite(s.leaveFeet)) {
        unplotted += 1;
        continue;
      }
      if (s.miss) misses.push(missDot(key, s.miss, s.leaveFeet));
      else distanceOnly.push({ key, layer: s.onGreen ? 'gir' : 'untagged', ft: s.leaveFeet });
    }
    const far = shots.some((s) => s.leaveFeet != null && s.leaveFeet > LINEAR_MAX_FT);
    return { misses, distanceOnly: distanceOnlyDots(distanceOnly), unplotted, far };
  }, [shots, indexOf]);

  const who = playerName ?? 'Whole team';
  const range = bandLabel(band);

  if (allShots.length === 0) {
    return (
      <section
        aria-label="Where approaches finish"
        className={cn('flex min-w-0 flex-col gap-2 rounded-card border border-border-subtle bg-surface p-4 sm:p-5', className)}
      >
        <Header who={who} figure={null} />
        <EmptyState
          variant="subtle"
          title="No approach shots tracked in these rounds"
          description="Approaches from 75 to 200 yards show up here once rounds are entered shot by shot."
        />
      </section>
    );
  }

  const n = summary.n;
  const gir = shots.filter((s) => s.onGreen).length;
  const untagged = n - gir - summary.missed;
  const girPlotted = plot.distanceOnly.filter((d) => d.layer === 'gir').length;
  const untaggedPlotted = plot.distanceOnly.length - girPlotted;
  const plotted = plot.misses.length + plot.distanceOnly.length;
  const dotR = plotted > 120 ? 3.4 : plotted > 50 ? 4.2 : 5.2;
  const avgR = summary.proximity != null && Number.isFinite(summary.proximity) ? radiusOf(summary.proximity) : null;
  const read = missRead(summary.byDirection, summary.missed);
  const pillId = `${svgId}-band`;

  const figure =
    summary.proximity != null ? (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">{formatFeet(summary.proximity)}</span>
        <span className="font-fw-sans text-caption text-text-tertiary">avg proximity</span>
        <span className="rounded-full bg-accent-wash px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums text-accent-ink">
          {formatPct(summary.girPct)} GIR
        </span>
      </div>
    ) : (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">{formatPct(summary.girPct)}</span>
        <span className="font-fw-sans text-caption text-text-tertiary">greens hit</span>
      </div>
    );

  const ariaLabel =
    `${plural(n, 'approach', 'approaches')} from ${range} yards: ${gir} on the green, ${summary.missed} missed with a tagged direction` +
    (untagged > 0 ? `, ${untagged} missed with no direction` : '') +
    (summary.proximity != null ? `. Average proximity ${formatFeet(summary.proximity)}.` : '.');

  const legend: { key: Layer; label: string; count: number; swatch: ReactNode; color: string }[] = [
    { key: 'gir', label: 'On green', count: gir, swatch: <GirSwatch />, color: GIR_STROKE },
    { key: 'miss', label: 'Missed', count: summary.missed, swatch: <MissSwatch />, color: MISS_FILL },
    { key: 'untagged', label: 'Missed, no direction', count: untagged, swatch: <UntaggedSwatch />, color: UNTAGGED_STROKE },
  ];

  return (
    <section
      aria-label="Where approaches finish"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
        className,
      )}
    >
      <Header who={`${who} · ${plural(n, 'shot', 'shots')} · ${range} yd`} figure={n > 0 ? figure : null} />

      <div className="flex flex-col gap-2">
        <div
          role="group"
          aria-label="Approach distance, yards"
          className="grid grid-cols-3 gap-1 rounded-fw-md border border-border-control bg-surface-sunken p-1 [@container(min-width:440px)]:grid-cols-6"
          style={{ boxShadow: SEGMENTED_TRACK_SUNKEN_SHADOW }}
        >
          {options.map((o) => {
            const on = o.id === band;
            const amber = o.id !== 'all' && flagged.has(o.id);
            return (
              <PressTarget
                key={o.id}
                aria-pressed={on}
                haptic="select"
                data-band={o.id}
                data-flagged={amber ? 'true' : undefined}
                onClick={() => setBand(o.id)}
                className={cn(
                  'relative isolate flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-fw-sm px-1 py-1.5 font-fw-sans',
                  on
                    ? 'text-text-on-accent-fill dark:text-accent-ink'
                    : amber
                      ? 'bg-fw-warning-bg text-text-primary'
                      : 'text-text-secondary hover:text-text-primary dark:text-text-primary',
                )}
              >
                {on ? <SegmentedPill quiet layoutId={reduced ? undefined : pillId} reduceMotion={reduced} /> : null}
                <span className="text-caption font-semibold tabular-nums">{o.label}</span>
                <span
                  className={cn(
                    'text-caption tabular-nums',
                    on ? 'font-medium' : amber ? 'font-semibold text-fw-warning-text' : 'text-text-tertiary',
                  )}
                >
                  {formatFeet(o.proximity)}
                </span>
              </PressTarget>
            );
          })}
        </div>
        {flagged.size > 0 ? (
          <p className="font-fw-sans text-caption text-text-tertiary">
            Amber bands finish further from the pin, for their distance, than the other bands.
          </p>
        ) : null}
      </div>

      {n === 0 ? (
        <EmptyState
          variant="subtle"
          title={`No approaches from ${range} yd`}
          description="Pick another distance to see where those finished."
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-fw-md" style={{ aspectRatio: `${W} / ${H}` }}>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="absolute inset-0 block size-full">
                <defs>
                  <pattern id={`${svgId}-mow`} width={24} height={H} patternUnits="userSpaceOnUse">
                    <rect width={12} height={H} style={{ fill: TURF.fairwayA }} />
                    <rect x={12} width={12} height={H} style={{ fill: TURF.fairwayB }} />
                  </pattern>
                  <radialGradient id={`${svgId}-green`} cx={PIN_X} cy={PIN_Y} r={FAR_OUT} gradientUnits="userSpaceOnUse">
                    <stop offset="0" style={{ stopColor: TURF.green }} />
                    <stop offset="0.5" style={{ stopColor: TURF.greenMid }} />
                    <stop offset="1" style={{ stopColor: TURF.rough }} />
                  </radialGradient>
                </defs>
                <rect width={W} height={H} style={{ fill: TURF.rough }} />
                <path d="M150 340 C 158 306, 170 282, 176 262 L 224 262 C 230 282, 242 306, 250 340 Z" fill={`url(#${svgId}-mow)`} />
                <circle cx={PIN_X} cy={PIN_Y} r={FAR_OUT} fill={`url(#${svgId}-green)`} />
                <path
                  d="M28 58 C 22 38, 44 24, 64 32 C 82 40, 82 62, 66 70 C 50 78, 32 74, 28 58 Z"
                  style={{ fill: TURF.sand, stroke: TURF.sandEdge }}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d="M334 286 C 344 268, 370 270, 376 290 C 382 308, 366 320, 350 316 C 336 312, 328 300, 334 286 Z"
                  style={{ fill: TURF.sand, stroke: TURF.sandEdge }}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />

                {plot.far ? (
                  <circle
                    cx={PIN_X}
                    cy={PIN_Y}
                    r={(FAR_IN + FAR_OUT) / 2}
                    fill="none"
                    style={{ stroke: TURF.far }}
                    strokeWidth={FAR_OUT - FAR_IN}
                  />
                ) : null}
                {RINGS.map((ft) => (
                  <circle
                    key={ft}
                    cx={PIN_X}
                    cy={PIN_Y}
                    r={radiusOf(ft)}
                    fill="none"
                    style={{ stroke: TURF.ring }}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {avgR != null ? (
                  <circle
                    data-avg-ring=""
                    cx={PIN_X}
                    cy={PIN_Y}
                    r={r1(avgR)}
                    fill="none"
                    style={{ stroke: TURF.avg }}
                    strokeWidth={1.25}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}

                {/* The pin: flag flies left so the ring labels (up-right) stay clear. */}
                <line
                  x1={PIN_X}
                  y1={PIN_Y}
                  x2={PIN_X}
                  y2={PIN_Y - 30}
                  style={{ stroke: 'var(--fw-color-text-primary)' }}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <path d={`M${PIN_X} ${PIN_Y - 30} L${PIN_X - 15} ${PIN_Y - 24} L${PIN_X} ${PIN_Y - 18} Z`} style={{ fill: 'var(--fw-color-danger)' }} />
                <circle cx={PIN_X} cy={PIN_Y} r={2.6} style={{ fill: 'var(--fw-color-text-primary)' }} />

                <g>
                  {plot.distanceOnly.map((d) =>
                    d.layer === 'gir' ? (
                      <circle
                        key={d.key}
                        cx={d.x}
                        cy={d.y}
                        r={r1(dotR * 0.85)}
                        data-layer="gir"
                        style={{ fill: GIR_FILL, stroke: GIR_STROKE }}
                        strokeWidth={1.25}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      <circle
                        key={d.key}
                        cx={d.x}
                        cy={d.y}
                        r={r1(dotR * 0.85)}
                        data-layer="untagged"
                        style={{ fill: 'var(--fw-color-surface)', stroke: UNTAGGED_STROKE }}
                        strokeWidth={1.5}
                        strokeDasharray="2 1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    ),
                  )}
                </g>
                <g>
                  {plot.misses.map((d) => (
                    <circle
                      key={d.key}
                      cx={d.x}
                      cy={d.y}
                      r={dotR}
                      data-layer="miss"
                      data-direction={d.direction ?? undefined}
                      style={{ fill: MISS_FILL, stroke: 'var(--fw-color-surface)' }}
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              </svg>

              <Tag x={PIN_X} y={11} className="font-medium">
                Long
              </Tag>
              <Tag x={PIN_X} y={H - 10} className="font-medium">
                Short
              </Tag>
              <Tag x={10} y={PIN_Y} align="start" className="font-medium">
                Left
              </Tag>
              <Tag x={W - 10} y={PIN_Y} align="end" className="font-medium">
                Right
              </Tag>
              {RINGS.map((ft) => {
                const p = polar(radiusOf(ft), RING_LABEL_DEG);
                return (
                  <Tag key={ft} x={p.x} y={p.y} className="tabular-nums">
                    {ft === 40 ? '40 ft' : ft}
                  </Tag>
                );
              })}
              {plot.far ? (
                <Tag x={polar(FAR_R, RING_LABEL_DEG).x} y={polar(FAR_R, RING_LABEL_DEG).y} className="tabular-nums">
                  60+ ft
                </Tag>
              ) : null}
              {avgR != null ? (
                <Tag
                  x={polar(avgR + 12, AVG_LABEL_DEG).x}
                  y={polar(avgR + 12, AVG_LABEL_DEG).y}
                  className="font-semibold text-text-primary"
                >
                  Avg
                </Tag>
              ) : null}
            </div>

            <p className="font-fw-sans text-caption text-text-tertiary">
              <span>Distance from the pin is measured; direction is the tagged one of eight.</span>{' '}
              {girPlotted + untaggedPlotted > 0 ? (
                <span>
                  {girPlotted > 0 && untaggedPlotted > 0
                    ? 'Greens hit and untagged misses show distance only, spaced evenly around the pin.'
                    : girPlotted > 0
                      ? 'Greens hit show distance only, spaced evenly around the pin.'
                      : 'Untagged misses show distance only, spaced evenly around the pin.'}
                </span>
              ) : null}{' '}
              {plot.unplotted > 0 ? (
                <span data-unplotted={plot.unplotted}>
                  {plural(plot.unplotted, 'shot has', 'shots have')} no measured distance and{' '}
                  {plot.unplotted === 1 ? 'is' : 'are'} counted but not drawn.
                </span>
              ) : null}
            </p>
          </div>

          <div className="grid gap-4 [@container(min-width:480px)]:grid-cols-[minmax(0,1fr)_minmax(0,216px)] [@container(min-width:480px)]:items-center">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
                {legend
                  .filter((l) => l.count > 0)
                  .map((l) => (
                    <span key={l.key} className="h-full" style={{ width: `${r1((l.count / n) * 100)}%`, background: l.color }} />
                  ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {legend
                  .filter((l) => l.key !== 'untagged' || l.count > 0)
                  .map((l) => (
                    <li key={l.key} data-legend={l.key} className="inline-flex items-center gap-1.5 font-fw-sans text-caption">
                      {l.swatch}
                      <span className="text-text-secondary">{l.label}</span>
                      <span className="font-semibold tabular-nums text-text-primary">{formatPct((l.count / n) * 100)}</span>
                    </li>
                  ))}
              </ul>
              {read ? <p className="font-fw-sans text-body-sm text-text-primary">{read}</p> : null}
            </div>

            <figure className="flex min-w-0 flex-col gap-1">
              <figcaption className="text-center font-fw-sans text-caption text-text-tertiary">
                {summary.missed > 0 ? `Where ${plural(summary.missed, 'tagged miss', 'tagged misses')} go` : 'Where misses go'}
              </figcaption>
              {summary.missed > 0 ? (
                <MissRose byDirection={summary.byDirection} missed={summary.missed} />
              ) : (
                <p className="py-6 text-center font-fw-sans text-caption text-text-tertiary">No tagged misses from {range} yd.</p>
              )}
            </figure>
          </div>
        </>
      )}
    </section>
  );
}
