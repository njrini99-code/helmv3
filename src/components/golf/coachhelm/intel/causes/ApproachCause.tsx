'use client';

/**
 * CoachHelm Home · cause visual for "Approach": where approaches finish.
 *
 * The card covers approaches from 50 to 250 yd (the band picker's range).
 * Every figure is a count over the slice's shots; nothing is estimated.
 *
 *  - Headline: average proximity over every approach with a measured leave,
 *    and the share that finished on the green. That is this one shot hitting
 *    the green, not GIR, so the copy never says GIR.
 *  - Pin plot: MISSED greens only, each at its measured distance on its tagged
 *    direction (one of eight). Misses on one direction whose leaves round to
 *    the same 3 ft share a mark, drawn at their mean distance, sized by count
 *    (area) and split by where they finished. Nothing is jittered or spread:
 *    every drawn position is a measured distance on a tagged direction. Leaves
 *    past 90 ft sit in a labelled far band.
 *  - Greens hit and untagged misses carry no direction, so they are not on the
 *    pin plot. The proximity strip is a feet axis of EVERY measured approach
 *    (hit the green above the line, missed below, untagged misses dashed) with
 *    the average marked, so its average is exactly the headline figure.
 *  - Tour marks come only from `data.refs.proximity` for the picked band's
 *    standard range (the bands sit inside wider tour ranges, and the copy says
 *    which). "All" mixes ranges, so it draws none. A null ref draws nothing.
 *  - From the lie: on-green share, average proximity and count per lie the
 *    approach was played from. Tapping a lie filters the whole card.
 */
import { useId, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
import type {
  ApproachFinish,
  ApproachLie,
  ApproachMiss,
  ApproachShot,
  TeamIntelligenceData,
} from '@/lib/golf/team-intelligence/types';
import { MISS_LABEL, formatFeet, formatPct, type CauseProps } from '../shared';

type Band = ApproachBandId | 'all';
type LieFilter = ApproachLie | 'all';

const RANGE_MIN = APPROACH_BANDS[0].min;
const RANGE_MAX = APPROACH_BANDS[APPROACH_BANDS.length - 1]!.max;
const RANGE_LABEL = `${RANGE_MIN}–${RANGE_MAX}`;
/** Below this many shots a lie row is drawn grey: shown, not compared. */
const LOW_N = 5;

// ---------------------------------------------------------------------------
// Pin plot geometry (viewBox units)
// ---------------------------------------------------------------------------

const W = 400;
const H = 344;
const PIN_X = 200;
const PIN_Y = 172;
/** Units per foot, linear out to 90 ft (the 90 ft ring sits at 135). */
const FT = 1.5;
const LINEAR_MAX_FT = 90;
/** Leaves past 90 ft sit in this labelled band, not at their distance. */
const FAR_R = 146;
const FAR_IN = 139;
const FAR_OUT = 153;
const RINGS = [15, 30, 45, 60, 90] as const;
/** Labelled rings; 15 and 45 sit too close to the spokes to carry text. */
const RING_LABELS = [30, 60, 90] as const;
/** Ring labels sit between two direction lines, where no mark is centred;
 *  the far band's label takes another such line so the two never collide. */
const RING_LABEL_DEG = -22.5;
const FAR_LABEL_DEG = -157.5;
/** Misses on one direction whose leaves round to the same 3 ft share a mark. */
const GROUP_FT = 3;
/** Mark radius for one miss (area grows with the count): at most R1_MAX,
 *  the largest mark in the slice at most R_BIG, never below R1_MIN. */
const R1_MAX = 5;
const R_BIG = 12;
const R1_MIN = 1.8;
/** A mark's radius stays under this share of its distance from the pin, so
 *  it never reaches into the next direction's eighth (sin 22.5° ≈ 0.38). */
const OCTANT_FIT = 0.36;

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

/** A band is amber when its average leave is this much longer than the
 *  slice's own distance trend predicts for it (a least-squares line of leave
 *  on yards over every measured approach in range). Judging against the
 *  trend, not leave per yard, keeps the short bands from always looking
 *  worst: proximity has a fixed part, so feet per yard climbs as the
 *  distance shrinks. A band needs `FLAG_MIN_N` measured leaves, and the trend
 *  needs `FLAG_MIN_BANDS` such bands. */
const FLAG_RATIO = 1.2;
const FLAG_MIN_N = 8;
const FLAG_MIN_BANDS = 3;

// ---------------------------------------------------------------------------
// Colour roles (tokens, so both themes follow)
//
// Green means one thing on this card: the approach hit the green. Missed
// greens are inked by where they finished: short grass a mid grey, rough a
// dark ink, a bunker amber, anything else (or not logged) an outline.
// ---------------------------------------------------------------------------

const WELL = 'var(--fw-color-surface-sunken)';
const CARD = 'var(--fw-color-surface)';
const RING_STROKE = 'color-mix(in oklab, var(--fw-color-text-primary) 24%, transparent)';
const FAR_FILL = 'color-mix(in oklab, var(--fw-color-text-primary) 6%, transparent)';
const TOUR_STROKE = 'var(--fw-viz-benchmark)';
const HIT_FILL = 'var(--fw-viz-div-pos)';
const OUTLINE = 'var(--fw-color-text-tertiary)';
const THIN_FILL = 'color-mix(in oklab, var(--fw-color-text-tertiary) 55%, var(--fw-color-surface))';
const ROSE_REST = 'color-mix(in oklab, var(--fw-color-text-tertiary) 40%, var(--fw-color-surface))';
const ROSE_TOP = 'color-mix(in oklab, var(--fw-color-text-primary) 85%, var(--fw-color-surface))';

const FINISH_ORDER: readonly ApproachFinish[] = ['fairway', 'rough', 'sand', 'other'];

const FINISH_LABEL: Record<ApproachFinish, string> = {
  fairway: 'Short grass',
  rough: 'Rough',
  sand: 'Bunker',
  other: 'Other',
};

const FINISH_PHRASE: Record<ApproachFinish, string> = {
  fairway: 'on short grass',
  rough: 'in the rough',
  sand: 'in a bunker',
  other: 'elsewhere or not logged',
};

/** Solid fills; `other` is drawn as an outline on whatever ground it sits. */
const FINISH_FILL: Record<Exclude<ApproachFinish, 'other'>, string> = {
  fairway: 'color-mix(in oklab, var(--fw-color-text-tertiary) 80%, var(--fw-color-surface))',
  rough: 'color-mix(in oklab, var(--fw-color-text-primary) 88%, var(--fw-color-surface))',
  sand: 'var(--fw-color-warning-text)',
};

function finishFill(f: ApproachFinish, ground: string): string {
  return f === 'other' ? ground : FINISH_FILL[f];
}

/** The lie the approach was played from (`lie_before`; tee = a par 3). */
const LIES: readonly { id: ApproachLie; label: string; phrase: string }[] = [
  { id: 'tee', label: 'Tee (par 3s)', phrase: 'the tee' },
  { id: 'fairway', label: 'Fairway', phrase: 'the fairway' },
  { id: 'rough', label: 'Rough', phrase: 'the rough' },
  { id: 'sand', label: 'Sand', phrase: 'sand' },
  { id: 'other', label: 'Other', phrase: 'other lies' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r1 = (v: number): number => Math.round(v * 10) / 10;
const rad = (deg: number): number => (deg * Math.PI) / 180;
const COUNT = new Intl.NumberFormat('en-US');
const count = (n: number): string => COUNT.format(n);

/** A percent string for an overlay position; never "NaN%". */
function at(v: number, total: number): string {
  return Number.isFinite(v) ? `${Math.round((v / total) * 10000) / 100}%` : '0%';
}

function plural(n: number, one: string, many: string): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const emptyFinish = (): Record<ApproachFinish, number> => ({ fairway: 0, rough: 0, sand: 0, other: 0 });

const bandOf = (band: Band) => (band === 'all' ? null : (APPROACH_BANDS.find((b) => b.id === band) ?? null));
const bandLabel = (band: Band): string => bandOf(band)?.label ?? RANGE_LABEL;

/** A standard's id as a yard range: '125_175' → '125–175', '175_plus' → '175+'. */
function refRange(ref: string): string {
  const [lo, hi] = ref.split('_');
  if (!lo) return ref;
  if (hi === 'plus') return `${lo}+`;
  return hi ? `${lo}–${hi}` : lo;
}

interface TourMark {
  ft: number;
  tour: TeamIntelligenceData['tourLabel'];
  /** The tour standard's own yard range, e.g. '125–175'. */
  range: string;
}

/** The tour proximity for the picked band's standard range, from the live
 *  refs only. 'All' mixes ranges and a null ref has no mark. */
function tourMark(data: TeamIntelligenceData, band: Band): TourMark | null {
  const b = bandOf(band);
  if (!b) return null;
  const v = data.refs.proximity[b.ref];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? { ft: v, tour: data.tourLabel, range: refRange(b.ref) } : null;
}

interface Leave {
  yards: number;
  feet: number;
}

function leavesOf(shots: readonly ApproachShot[]): Leave[] {
  return shots.flatMap((s) =>
    s.leaveFeet != null && Number.isFinite(s.leaveFeet) && Number.isFinite(s.fromYards) ? [{ yards: s.fromYards, feet: s.leaveFeet }] : [],
  );
}

/** Bands whose average leave is `FLAG_RATIO`× what the slice's own
 *  leave-on-yards trend predicts at that band's average distance. */
function flaggedBands(shots: readonly ApproachShot[]): Set<ApproachBandId> {
  const out = new Set<ApproachBandId>();
  const bands = APPROACH_BANDS.map((b) => ({ id: b.id, leaves: leavesOf(approachInBand(shots, b.id)) })).filter(
    (b) => b.leaves.length >= FLAG_MIN_N,
  );
  if (bands.length < FLAG_MIN_BANDS) return out;
  const all = leavesOf(approachInBand(shots, 'all'));
  const mx = mean(all.map((l) => l.yards));
  const my = mean(all.map((l) => l.feet));
  if (mx == null || my == null) return out;
  let sxy = 0;
  let sxx = 0;
  for (const l of all) {
    sxy += (l.yards - mx) * (l.feet - my);
    sxx += (l.yards - mx) ** 2;
  }
  if (sxx <= 0) return out;
  const slope = sxy / sxx;
  for (const b of bands) {
    const yards = mean(b.leaves.map((l) => l.yards));
    const feet = mean(b.leaves.map((l) => l.feet));
    if (yards == null || feet == null) continue;
    const expected = my + slope * (yards - mx);
    if (expected > 0 && feet >= expected * FLAG_RATIO) out.add(b.id);
  }
  return out;
}

function measuredLeaves(shots: readonly ApproachShot[]): number[] {
  return shots.map((s) => s.leaveFeet).filter((v): v is number => v != null && Number.isFinite(v));
}

/** Width of a node, measured before paint and kept current. */
function useMeasuredWidth(fallback: number) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!node) return undefined;
    const read = () => {
      const w = Math.round(node.getBoundingClientRect().width);
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width] as const;
}

// ---------------------------------------------------------------------------
// Pin plot model: one mark per (direction, 3 ft) group of tagged misses
// ---------------------------------------------------------------------------

interface MissGroup {
  key: string;
  direction: ApproachMiss;
  /** Past `LINEAR_MAX_FT`: drawn in the far band. */
  far: boolean;
  count: number;
  /** Mean measured leave of the group, ft. */
  ft: number;
  byFinish: Record<ApproachFinish, number>;
  /** Distance from the pin in viewBox units, and the exact position. */
  s: number;
  x: number;
  y: number;
}

function radiusOf(ft: number): number {
  return ft <= LINEAR_MAX_FT ? Math.max(0, ft) * FT : FAR_R;
}

function polar(r: number, deg: number): { x: number; y: number } {
  return { x: PIN_X + r * Math.cos(rad(deg)), y: PIN_Y + r * Math.sin(rad(deg)) };
}

function groupMisses(shots: readonly ApproachShot[]): MissGroup[] {
  const acc = new Map<string, { direction: ApproachMiss; far: boolean; count: number; sum: number; byFinish: Record<ApproachFinish, number> }>();
  for (const s of shots) {
    if (s.onGreen || !s.miss || s.leaveFeet == null || !Number.isFinite(s.leaveFeet)) continue;
    const far = s.leaveFeet > LINEAR_MAX_FT;
    const key = `${s.miss}:${far ? 'far' : Math.round(Math.max(0, s.leaveFeet) / GROUP_FT)}`;
    let g = acc.get(key);
    if (!g) {
      g = { direction: s.miss, far, count: 0, sum: 0, byFinish: emptyFinish() };
      acc.set(key, g);
    }
    g.count += 1;
    g.sum += s.leaveFeet;
    g.byFinish[s.finish ?? 'other'] += 1;
  }
  return [...acc.entries()].map(([key, g]) => {
    const ft = g.sum / g.count;
    const s = g.far ? FAR_R : radiusOf(ft);
    const p = polar(s, ANGLE[g.direction]);
    return { key, direction: g.direction, far: g.far, count: g.count, ft, byFinish: g.byFinish, s, x: r1(p.x), y: r1(p.y) };
  });
}

/** Radius of a one-miss mark for this slice: the biggest mark stays under
 *  `R_BIG` and every mark stays inside its direction's eighth. */
function markUnit(groups: readonly MissGroup[]): number {
  let u = R1_MAX;
  for (const g of groups) {
    const root = Math.sqrt(g.count);
    u = Math.min(u, R_BIG / root);
    // Very short leaves (under 10 ft) are allowed to spill rather than shrink
    // every other mark on the plot.
    if (g.s >= 15) u = Math.min(u, (OCTANT_FIT * g.s) / root);
  }
  return Math.max(R1_MIN, u);
}

function wedgePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => `${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}`;
  return `M${r1(cx)} ${r1(cy)} L${p(a0)} A${r1(r)} ${r1(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z`;
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
  halo = false,
  children,
  className,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  align?: 'start' | 'center' | 'end';
  /** A well-coloured glow, so the text holds over a ring or a mark. */
  halo?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const style: CSSProperties = { top: at(y, h) };
  if (halo) style.textShadow = `0 0 2px ${WELL}, 0 0 4px ${WELL}`;
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
        <p className="font-fw-sans text-caption text-text-tertiary">{who}</p>
      </div>
      {figure}
    </div>
  );
}

function FinishSwatch({ finish }: { finish: ApproachFinish }) {
  if (finish === 'other') {
    return <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-text-tertiary bg-surface" />;
  }
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: FINISH_FILL[finish] }} />;
}

function SubHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">{title}</h4>
      {aside ? <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">{aside}</span> : null}
    </div>
  );
}

// Pin plot -------------------------------------------------------------------

function MissMark({ g, unit }: { g: MissGroup; unit: number }) {
  const r = r1(unit * Math.sqrt(g.count));
  const parts = FINISH_ORDER.filter((f) => g.byFinish[f] > 0);
  const single = parts.length === 1 ? parts[0]! : null;
  const wedges: { f: ApproachFinish; d: string }[] = [];
  if (!single) {
    let a = -Math.PI / 2;
    for (const f of parts) {
      const next = a + (g.byFinish[f] / g.count) * Math.PI * 2;
      wedges.push({ f, d: wedgePath(g.x, g.y, r, a, next) });
      a = next;
    }
  }
  return (
    <g data-mark="" data-direction={g.direction} data-count={g.count} data-finish={single ?? 'mixed'}>
      <circle
        data-layer="miss"
        data-direction={g.direction}
        cx={g.x}
        cy={g.y}
        r={r}
        style={{
          fill: single ? finishFill(single, WELL) : WELL,
          stroke: single === 'other' ? OUTLINE : WELL,
        }}
        strokeWidth={single === 'other' ? 1.25 : 1.5}
        vectorEffect="non-scaling-stroke"
      />
      {wedges.map((w) => (
        <path
          key={w.f}
          d={w.d}
          style={{ fill: finishFill(w.f, WELL), stroke: w.f === 'other' ? OUTLINE : WELL }}
          strokeWidth={0.75}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

function PinPlot({
  groups,
  tour,
  label,
  empty,
}: {
  groups: readonly MissGroup[];
  tour: TourMark | null;
  label: string;
  empty: string | null;
}) {
  const unit = markUnit(groups);
  const far = groups.some((g) => g.far);
  const maxCount = groups.reduce((m, g) => Math.max(m, g.count), 0);
  // Largest first, so a small mark is never hidden under a big neighbour.
  const ordered = [...groups].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const big = r1(unit * Math.sqrt(Math.max(1, maxCount)));
  const legendX = 10 + big;
  const legendBase = H - 10;

  return (
    <div
      className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-fw-md"
      style={{ aspectRatio: `${W} / ${H}`, background: WELL, boxShadow: SEGMENTED_TRACK_SUNKEN_SHADOW }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="absolute inset-0 block size-full">
        {far ? (
          <circle
            cx={PIN_X}
            cy={PIN_Y}
            r={(FAR_IN + FAR_OUT) / 2}
            fill="none"
            style={{ stroke: FAR_FILL }}
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
            style={{ stroke: RING_STROKE }}
            strokeWidth={1}
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {tour ? (
          <circle
            data-tour-ring=""
            cx={PIN_X}
            cy={PIN_Y}
            r={r1(radiusOf(tour.ft))}
            fill="none"
            style={{ stroke: TOUR_STROKE }}
            strokeWidth={1.75}
            strokeDasharray="7 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* The pin, under the marks: the flag flies left so the ring labels
            (up-right) stay clear. */}
        <line
          x1={PIN_X}
          y1={PIN_Y}
          x2={PIN_X}
          y2={PIN_Y - 26}
          style={{ stroke: 'var(--fw-color-text-primary)' }}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <path d={`M${PIN_X} ${PIN_Y - 26} L${PIN_X - 13} ${PIN_Y - 21} L${PIN_X} ${PIN_Y - 16} Z`} style={{ fill: 'var(--fw-color-danger)' }} />
        <circle cx={PIN_X} cy={PIN_Y} r={2.4} style={{ fill: 'var(--fw-color-text-primary)' }} />

        <g>
          {ordered.map((g) => (
            <MissMark key={g.key} g={g} unit={unit} />
          ))}
        </g>

        {maxCount > 1 ? (
          <g aria-hidden>
            <circle
              cx={legendX}
              cy={r1(legendBase - big)}
              r={big}
              fill="none"
              style={{ stroke: OUTLINE }}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={legendX}
              cy={r1(legendBase - unit)}
              r={r1(unit)}
              fill="none"
              style={{ stroke: OUTLINE }}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null}
      </svg>

      <Tag x={PIN_X} y={9} className="font-medium">
        Long
      </Tag>
      <Tag x={PIN_X} y={H - 9} className="font-medium">
        Short
      </Tag>
      <Tag x={10} y={PIN_Y} align="start" className="font-medium">
        Left
      </Tag>
      <Tag x={W - 10} y={PIN_Y} align="end" className="font-medium">
        Right
      </Tag>
      {RING_LABELS.map((ft) => {
        const p = polar(radiusOf(ft), RING_LABEL_DEG);
        return (
          <Tag key={ft} x={p.x} y={p.y} halo className="tabular-nums text-text-tertiary">
            {ft === 90 ? '90 ft' : ft}
          </Tag>
        );
      })}
      {far ? (
        <Tag x={polar(FAR_R, FAR_LABEL_DEG).x} y={polar(FAR_R, FAR_LABEL_DEG).y} halo className="tabular-nums">
          90+ ft
        </Tag>
      ) : null}
      {maxCount > 1 ? (
        <Tag x={legendX + big + 6} y={legendBase - big} align="start" className="tabular-nums text-text-tertiary">
          {`1 to ${count(maxCount)} misses`}
        </Tag>
      ) : null}
      {tour ? (
        <span
          data-tour-label=""
          aria-hidden
          className="absolute left-2 top-2 flex flex-col gap-1 rounded-fw-sm bg-surface px-2 py-1.5 font-fw-sans text-caption leading-none tabular-nums shadow-flat"
        >
          <span className="flex items-center gap-1.5 font-semibold text-text-primary">
            <svg width="16" height="4" className="block shrink-0" aria-hidden>
              <line x1="0" y1="2" x2="16" y2="2" strokeWidth="2" strokeDasharray="5 3" style={{ stroke: TOUR_STROKE }} />
            </svg>
            {`${tour.tour} ${formatFeet(tour.ft)}`}
          </span>
          <span className="text-text-secondary">{`from ${tour.range} yd`}</span>
        </span>
      ) : null}
      {empty ? (
        <span className="pointer-events-none absolute inset-x-6 top-[64%] mx-auto w-fit max-w-[80%] rounded-fw-sm bg-surface px-3 py-2 text-center font-fw-sans text-caption text-text-secondary shadow-flat">
          {empty}
        </span>
      ) : null}
    </div>
  );
}

// Missed greens ----------------------------------------------------------------

function FinishBreakdown({ counts, missed, n }: { counts: Record<ApproachFinish, number>; missed: number; n: number }) {
  const rows = FINISH_ORDER.filter((f) => f !== 'other' || counts.other > 0);
  return (
    <div className="flex flex-col gap-2.5">
      <SubHead
        title="Missed greens finish in"
        aside={missed > 0 ? `${plural(missed, 'miss', 'misses')} · ${formatPct(share(missed, n))} of shots` : null}
      />
      {missed === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-secondary">Every approach here hit the green.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((f) => {
            const c = counts[f];
            const pct = share(c, missed) ?? 0;
            return (
              <li
                key={f}
                data-finish-row={f}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_2.5rem_2.5rem] items-center gap-2 font-fw-sans text-caption"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <FinishSwatch finish={f} />
                  <span className="min-w-0 leading-tight text-text-secondary">{FINISH_LABEL[f]}</span>
                </span>
                <span aria-hidden className="relative h-2 overflow-hidden rounded-full bg-surface-sunken">
                  {c > 0 ? (
                    <span
                      className={cn('absolute inset-y-0 left-0 rounded-full', f === 'other' && 'border border-text-tertiary')}
                      style={{ width: `${r1(pct)}%`, background: f === 'other' ? CARD : FINISH_FILL[f] }}
                    />
                  ) : null}
                </span>
                <span className="text-right font-semibold tabular-nums text-text-primary">{formatPct(pct)}</span>
                <span className="text-right tabular-nums text-text-tertiary">{count(c)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const ROSE = 200;
const ROSE_C = 100;
const ROSE_R0 = 12;
const ROSE_R1 = 60;
const ROSE_LABEL_R = 82;

function roseWedge(deg: number, r: number): string {
  const a0 = rad(deg - 19);
  const a1 = rad(deg + 19);
  const p = (rr: number, a: number) => `${r1(ROSE_C + rr * Math.cos(a))} ${r1(ROSE_C + rr * Math.sin(a))}`;
  return `M${p(ROSE_R0, a0)} L${p(r, a0)} A${r1(r)} ${r1(r)} 0 0 1 ${p(r, a1)} L${p(ROSE_R0, a1)} A${ROSE_R0} ${ROSE_R0} 0 0 0 ${p(ROSE_R0, a0)} Z`;
}

/** Eight wedges, one per tagged direction, oriented like the pin plot (long
 *  up). Radius grows with the square root of the share so wedge AREA is
 *  proportional to it; the most common direction (every one, on a tie) is
 *  inked darkest. */
function MissRose({ byDirection, missed }: { byDirection: Record<ApproachMiss, number>; missed: number }) {
  const max = Math.max(...APPROACH_MISSES.map((d) => byDirection[d]));
  const shares = APPROACH_MISSES.map((d) => ({ d, count: byDirection[d], share: missed > 0 ? byDirection[d] / missed : 0 }));
  const label = `Tagged misses by direction: ${shares.map((s) => `${MISS_LABEL[s.d]} ${formatPct(s.share * 100)}`).join(', ')}.`;
  const guide = ROSE_R0 + (ROSE_R1 - ROSE_R0) * Math.SQRT1_2;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[208px] [@container(min-width:720px)]:max-w-[248px]">
      <svg viewBox={`0 0 ${ROSE} ${ROSE}`} role="img" aria-label={label} className="absolute inset-0 block size-full">
        <circle cx={ROSE_C} cy={ROSE_C} r={ROSE_R1} fill="none" style={{ stroke: RING_STROKE }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <circle
          cx={ROSE_C}
          cy={ROSE_C}
          r={r1(guide)}
          fill="none"
          style={{ stroke: RING_STROKE }}
          strokeWidth={1}
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
        {shares.map(({ d, count: c, share: s }) =>
          c > 0 ? (
            <path
              key={d}
              d={roseWedge(ANGLE[d], ROSE_R0 + (ROSE_R1 - ROSE_R0) * Math.sqrt(s))}
              data-direction={d}
              data-dominant={c === max ? 'true' : 'false'}
              style={{ fill: c === max ? ROSE_TOP : ROSE_REST }}
            />
          ) : null,
        )}
        <circle cx={ROSE_C} cy={ROSE_C} r={3} style={{ fill: 'var(--fw-color-text-primary)' }} />
      </svg>
      {shares.map(({ d, count: c, share: s }) => {
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
                c === max && c > 0 ? 'font-semibold text-text-primary' : c > 0 ? 'text-text-secondary' : 'text-text-tertiary',
              )}
            >
              {formatPct(s * 100)}
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
  const pct = formatPct((max / missed) * 100);
  if (top.length === 1) return `The most common miss is ${MISS_LABEL[top[0]!]}: ${pct} of tagged misses.`;
  return `${capitalise(listOf(top.map((d) => MISS_LABEL[d])))} tie as the most common miss: ${pct} of tagged misses each.`;
}

// Proximity strip ------------------------------------------------------------

/** Strip bins: 3 ft wide out to 90 ft, then one far bin for anything past. */
const BIN_FT = 3;
const LINEAR_BINS = LINEAR_MAX_FT / BIN_FT;
const FAR_BIN = LINEAR_BINS;
const STRIP_TICKS = [0, 15, 30, 45, 60, 75] as const;
const ST = {
  padX: 8,
  /** Room above the hit lane for the average's label. */
  top: 18,
  /** The feet axis between the two lanes. */
  axis: 18,
  /** Room below the missed lane for the tour label. */
  bottom: 18,
  /** The fuller lane is at most this tall; both lanes share one scale. */
  laneMax: 64,
  laneMin: 10,
  /** One shot's height when there is room (px). */
  unitMax: 7,
  /** From this unit height up, each shot is its own block. */
  blockMin: 4,
} as const;

type Seg = ApproachFinish | 'untagged';
/** Stacked from the line outward: short grass, rough, bunker, other, then
 *  misses with no direction tag (dashed). */
const SEG_ORDER: readonly Seg[] = ['fairway', 'rough', 'sand', 'other', 'untagged'];

interface StripModel {
  bins: { hit: number; miss: Record<Seg, number> }[];
  hits: number;
  misses: number;
  untagged: number;
  measured: number;
  avg: number | null;
  /** Tallest bin in each lane (shots). */
  hitMax: number;
  missMax: number;
}

function stripModel(shots: readonly ApproachShot[]): StripModel {
  const bins = Array.from({ length: LINEAR_BINS + 1 }, () => ({
    hit: 0,
    miss: { fairway: 0, rough: 0, sand: 0, other: 0, untagged: 0 } as Record<Seg, number>,
  }));
  let hits = 0;
  let misses = 0;
  let untagged = 0;
  const leaves: number[] = [];
  for (const s of shots) {
    const ft = s.leaveFeet;
    if (ft == null || !Number.isFinite(ft)) continue;
    leaves.push(ft);
    const bin = bins[ft > LINEAR_MAX_FT ? FAR_BIN : Math.min(LINEAR_BINS - 1, Math.max(0, Math.floor(ft / BIN_FT)))]!;
    if (s.onGreen) {
      bin.hit += 1;
      hits += 1;
    } else {
      misses += 1;
      if (!s.miss) {
        bin.miss.untagged += 1;
        untagged += 1;
      } else {
        bin.miss[s.finish ?? 'other'] += 1;
      }
    }
  }
  const hitMax = bins.reduce((m, b) => Math.max(m, b.hit), 0);
  const missMax = bins.reduce((m, b) => Math.max(m, SEG_ORDER.reduce((t, k) => t + b.miss[k], 0)), 0);
  return { bins, hits, misses, untagged, measured: leaves.length, avg: mean(leaves), hitMax, missMax };
}

function segStyle(seg: Seg | 'hit'): { fill: string; stroke?: string; dash?: string } {
  if (seg === 'hit') return { fill: HIT_FILL };
  if (seg === 'untagged') return { fill: CARD, stroke: OUTLINE, dash: '2 1.5' };
  if (seg === 'other') return { fill: CARD, stroke: OUTLINE };
  return { fill: FINISH_FILL[seg] };
}

/** Axis text sits over the marker lines on a card-coloured halo. */
const HALO: CSSProperties = { stroke: CARD, strokeWidth: 3, strokeLinejoin: 'round', paintOrder: 'stroke' };

function ProximityStrip({ model, tour, label }: { model: StripModel; tour: TourMark | null; label: string }) {
  const [ref, width] = useMeasuredWidth(320);
  const plotW = Math.max(160, width - ST.padX * 2);
  const slot = plotW / (LINEAR_BINS + 1.6);
  const gap = slot >= 6 ? 1.5 : 1;
  const barW = r1(Math.max(1, slot - gap));
  // One scale for both lanes, so a taller bar is always more shots; each
  // lane is only as tall as its own fullest bin.
  const unitH = Math.min(ST.unitMax, ST.laneMax / Math.max(1, model.hitMax, model.missMax));
  const blocks = unitH >= ST.blockMin;
  const hitH = Math.max(ST.laneMin, model.hitMax * unitH);
  const missH = Math.max(ST.laneMin, model.missMax * unitH);
  const hitBase = ST.top + hitH;
  const missTop = hitBase + ST.axis;
  const missEnd = missTop + missH;
  const height = missEnd + ST.bottom;
  const binX = (i: number) => ST.padX + (i < LINEAR_BINS ? i : LINEAR_BINS + 0.6) * slot;
  const xFt = (ft: number) => (ft > LINEAR_MAX_FT ? binX(FAR_BIN) + slot / 2 : ST.padX + (Math.max(0, ft) / BIN_FT) * slot);
  const anchor = (x: number) => (x < ST.padX + 40 ? 'start' : x > width - ST.padX - 40 ? 'end' : 'middle');

  const rects: ReactNode[] = [];
  const stack = (key: string, x: number, seg: Seg | 'hit', c: number, offset: number, up: boolean) => {
    const style = segStyle(seg);
    const common = {
      x,
      width: barW,
      rx: 1,
      'data-lane': up ? 'hit' : 'missed',
      'data-seg': seg,
      style: { fill: style.fill, stroke: style.stroke },
      strokeWidth: style.stroke ? 1 : undefined,
      strokeDasharray: style.dash,
    };
    if (blocks) {
      for (let j = 0; j < c; j += 1) {
        const k = offset + j;
        const y = up ? hitBase - (k + 1) * unitH + 1 : missTop + k * unitH;
        rects.push(<rect key={`${key}-${j}`} {...common} y={r1(y)} height={r1(Math.max(1, unitH - 1))} data-count={1} />);
      }
    } else {
      const h = c * unitH;
      const y = up ? hitBase - (offset * unitH + h) : missTop + offset * unitH;
      rects.push(<rect key={key} {...common} y={r1(y)} height={r1(Math.max(0.5, h))} data-count={c} />);
    }
  };
  model.bins.forEach((b, i) => {
    const x = r1(binX(i) + gap / 2);
    if (b.hit > 0) stack(`h${i}`, x, 'hit', b.hit, 0, true);
    let offset = 0;
    for (const seg of SEG_ORDER) {
      const c = b.miss[seg];
      if (c > 0) {
        stack(`m${i}-${seg}`, x, seg, c, offset, false);
        offset += c;
      }
    }
  });

  const avgX = model.avg == null ? null : r1(xFt(model.avg));
  const tourX = tour ? r1(xFt(tour.ft)) : null;
  const right = r1(ST.padX + plotW);
  const axisY = r1(hitBase + ST.axis / 2 + 4);

  return (
    <div ref={ref} className="w-full min-w-0">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={r1(height)}
        viewBox={`0 0 ${width} ${r1(height)}`}
        className="block overflow-visible font-fw-sans"
      >
        <line x1={ST.padX} x2={right} y1={r1(hitBase + 0.5)} y2={r1(hitBase + 0.5)} style={{ stroke: 'var(--fw-color-border-strong)' }} />
        <line x1={ST.padX} x2={right} y1={r1(missTop - 0.5)} y2={r1(missTop - 0.5)} style={{ stroke: 'var(--fw-color-border-strong)' }} />
        {rects}
        {tourX != null && tour ? (
          <g data-tour-tick="">
            <line x1={tourX} x2={tourX} y1={ST.top} y2={r1(missEnd + 4)} strokeWidth={4} style={{ stroke: CARD }} />
            <line
              x1={tourX}
              x2={tourX}
              y1={ST.top}
              y2={r1(missEnd + 4)}
              strokeWidth={1.75}
              strokeDasharray="5 3"
              style={{ stroke: TOUR_STROKE }}
            />
            <text
              x={tourX}
              y={r1(height - 3)}
              fontSize={12}
              fontWeight={600}
              textAnchor={anchor(tourX)}
              className="tabular-nums"
              style={{ fill: 'var(--fw-color-text-secondary)' }}
            >
              {`${tour.tour} ${formatFeet(tour.ft)}`}
            </text>
          </g>
        ) : null}
        {avgX != null && model.avg != null ? (
          <g data-avg-mark="">
            <line x1={avgX} x2={avgX} y1={ST.top - 4} y2={r1(missEnd)} strokeWidth={4} style={{ stroke: CARD }} />
            <line x1={avgX} x2={avgX} y1={ST.top - 4} y2={r1(missEnd)} strokeWidth={1.5} style={{ stroke: 'var(--fw-color-text-primary)' }} />
            <text
              x={avgX}
              y={10}
              fontSize={12}
              fontWeight={600}
              textAnchor={anchor(avgX)}
              className="tabular-nums"
              style={{ fill: 'var(--fw-color-text-primary)' }}
            >
              {`Avg ${formatFeet(model.avg)}`}
            </text>
          </g>
        ) : null}
        {STRIP_TICKS.map((t) => (
          <text
            key={t}
            x={r1(xFt(t))}
            y={axisY}
            fontSize={12}
            textAnchor={t === 0 ? 'start' : 'middle'}
            className="tabular-nums"
            style={{ ...HALO, fill: 'var(--fw-color-text-tertiary)' }}
          >
            {t}
          </text>
        ))}
        <text x={right} y={axisY} fontSize={12} textAnchor="end" className="tabular-nums" style={{ ...HALO, fill: 'var(--fw-color-text-tertiary)' }}>
          90+ ft
        </text>
      </svg>
    </div>
  );
}

// From the lie -----------------------------------------------------------------

interface LieRow {
  id: ApproachLie;
  label: string;
  n: number;
  hitPct: number | null;
  avg: number | null;
}

const LIE_GRID = 'grid grid-cols-[minmax(0,1fr)_3.5rem_2.75rem_2.5rem] items-center gap-x-2';

function LiePanel({
  rows,
  lie,
  overall,
  onPick,
}: {
  rows: readonly LieRow[];
  lie: LieFilter;
  overall: number | null;
  onPick: (lie: LieFilter) => void;
}) {
  const thin = rows.some((r) => r.n > 0 && r.n < LOW_N);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SubHead title="From the lie" aside={lie === 'all' ? 'Tap to filter' : 'Tap again to clear'} />
      <div aria-hidden className={cn(LIE_GRID, 'whitespace-nowrap px-2.5 font-fw-sans text-caption text-text-tertiary')}>
        <span>Played from</span>
        <span className="text-right">On green</span>
        <span className="text-right">Avg</span>
        <span className="text-right">Shots</span>
      </div>
      <div role="group" aria-label="Filter by the lie the approach was played from" className="flex flex-col gap-1">
        {rows.map((r) => {
          const on = lie === r.id;
          const blocked = r.n === 0 && !on;
          const low = r.n > 0 && r.n < LOW_N;
          const summary =
            r.n === 0
              ? 'no shots'
              : `${formatPct(r.hitPct)} on the green, ${r.avg == null ? 'no measured leave' : `avg ${formatFeet(r.avg)}`}, ${plural(r.n, 'shot', 'shots')}${low ? ', low sample' : ''}`;
          return (
            <PressTarget
              key={r.id}
              data-lie={r.id}
              haptic={blocked ? false : 'select'}
              aria-pressed={on}
              aria-disabled={blocked || undefined}
              aria-label={`${r.label}: ${summary}`}
              onClick={() => {
                if (!blocked) onPick(on ? 'all' : r.id);
              }}
              className={cn(
                LIE_GRID,
                'w-full gap-y-1.5 rounded-fw-sm px-2.5 py-2 text-left font-fw-sans text-caption',
                on ? 'ring-2 ring-text-primary' : 'hover:ring-1 hover:ring-border-strong',
                blocked && 'cursor-default',
              )}
            >
              <span className={cn('min-w-0 truncate', on ? 'font-semibold' : 'font-medium', r.n === 0 ? 'text-text-tertiary' : 'text-text-primary')}>
                {r.label}
              </span>
              <span className={cn('text-right font-semibold tabular-nums', low ? 'text-text-secondary' : 'text-text-primary')}>
                {r.n > 0 ? formatPct(r.hitPct) : ''}
              </span>
              <span className="text-right tabular-nums text-text-secondary">
                {r.n > 0 ? (r.avg == null ? 'no data' : formatFeet(r.avg)) : ''}
              </span>
              <span className="text-right tabular-nums text-text-tertiary">{count(r.n)}</span>
              <span aria-hidden className="relative col-span-4 h-1.5 rounded-full bg-surface-sunken">
                {r.n > 0 && r.hitPct != null ? (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${r1(Math.min(100, Math.max(0, r.hitPct)))}%`, background: low ? THIN_FILL : HIT_FILL }}
                  />
                ) : null}
                {overall != null && r.n > 0 ? (
                  <span
                    className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded-full bg-text-primary"
                    style={{ left: `${r1(Math.min(100, Math.max(0, overall)))}%` }}
                  />
                ) : null}
              </span>
            </PressTarget>
          );
        })}
      </div>
      {overall != null ? (
        <p className="font-fw-sans text-caption text-text-tertiary">
          {`The tick is every lie together: ${formatPct(overall)} on the green.`}
          {thin ? ' Grey bars have under 5 shots.' : ''}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApproachCause
// ---------------------------------------------------------------------------

export function ApproachCause({ data, allowed, playerId, playerName, className }: CauseProps) {
  const [band, setBand] = useState<Band>('all');
  const [lie, setLie] = useState<LieFilter>('all');
  const rawId = useId();
  const pillId = `app-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}-band`;
  const reduced = useReducedMotionGuard() ?? false;

  const sliceShots = useMemo(
    () => inRounds(data.approach, allowed, data.rounds, playerId),
    [data.approach, allowed, data.rounds, playerId],
  );
  /** Every approach from 50 to 250 yd in the slice, any lie. */
  const inRange = useMemo(() => approachInBand(sliceShots, 'all'), [sliceShots]);
  const outside = sliceShots.length - inRange.length;
  /** The lie filter, every band: what the picker reads. */
  const lieShots = useMemo(() => (lie === 'all' ? inRange : inRange.filter((s) => s.lie === lie)), [inRange, lie]);
  const flagged = useMemo(() => flaggedBands(lieShots), [lieShots]);
  const options = useMemo(
    () =>
      [{ id: 'all' as Band, label: 'All' }, ...APPROACH_BANDS.map((b) => ({ id: b.id as Band, label: b.label }))].map((o) => {
        const list = o.id === 'all' ? lieShots : approachInBand(lieShots, o.id);
        return { ...o, n: list.length, proximity: mean(measuredLeaves(list)) };
      }),
    [lieShots],
  );
  /** The band, every lie: what the lie panel reads. */
  const bandShots = useMemo(() => (band === 'all' ? inRange : approachInBand(inRange, band)), [band, inRange]);
  const shots = useMemo(() => (lie === 'all' ? bandShots : bandShots.filter((s) => s.lie === lie)), [bandShots, lie]);
  const summary = useMemo(() => approachSummary(shots), [shots]);
  const groups = useMemo(() => groupMisses(shots), [shots]);
  const strip = useMemo(() => stripModel(shots), [shots]);
  const lieRows = useMemo<LieRow[]>(
    () =>
      LIES.map((l) => {
        const list = bandShots.filter((s) => s.lie === l.id);
        return {
          id: l.id,
          label: l.label,
          n: list.length,
          hitPct: share(list.filter((s) => s.onGreen).length, list.length),
          avg: mean(measuredLeaves(list)),
        };
      }).filter((r) => r.id !== 'other' || r.n > 0 || lie === 'other'),
    [bandShots, lie],
  );

  const who = playerName ?? 'Whole team';
  const range = bandLabel(band);
  const tour = tourMark(data, band);
  const liePhrase = lie === 'all' ? null : (LIES.find((l) => l.id === lie)?.phrase ?? null);

  if (inRange.length === 0) {
    return (
      <section
        aria-label="Where approaches finish"
        className={cn('flex min-w-0 flex-col gap-2 rounded-card border border-border-subtle bg-surface p-4 sm:p-5', className)}
      >
        <Header who={who} figure={null} />
        {sliceShots.length === 0 ? (
          <EmptyState
            variant="subtle"
            title="No approach shots tracked in these rounds"
            description={`Approaches from ${RANGE_MIN} to ${RANGE_MAX} yards show up here once rounds are entered shot by shot.`}
          />
        ) : (
          <EmptyState
            variant="subtle"
            title={`No approaches from ${RANGE_MIN} to ${RANGE_MAX} yd`}
            description={`${plural(outside, 'approach', 'approaches')} in these rounds ${outside === 1 ? 'was' : 'were'} outside this card's range.`}
          />
        )}
      </section>
    );
  }

  const n = summary.n;
  const hits = shots.filter((s) => s.onGreen).length;
  const missedAll = n - hits;
  const finishCounts = emptyFinish();
  for (const s of shots) if (!s.onGreen) finishCounts[s.finish ?? 'other'] += 1;
  const untaggedMisses = shots.filter((s) => !s.onGreen && !s.miss).length;
  const unmeasuredTagged = shots.filter((s) => !s.onGreen && s.miss && (s.leaveFeet == null || !Number.isFinite(s.leaveFeet))).length;
  const plotted = groups.reduce((t, g) => t + g.count, 0);
  const far = groups.some((g) => g.far);
  const plottedByFinish = emptyFinish();
  for (const g of groups) for (const f of FINISH_ORDER) plottedByFinish[f] += g.byFinish[f];
  const overallHit = share(bandShots.filter((s) => s.onGreen).length, bandShots.length);
  const read = missRead(summary.byDirection, summary.missed);
  const overline = [who, plural(n, 'shot', 'shots'), `${range} yd`, liePhrase ? `from ${liePhrase}` : null].filter(Boolean).join(' · ');

  const figure =
    n === 0 ? null : summary.proximity != null ? (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">
          {formatFeet(summary.proximity)}
        </span>
        <span className="font-fw-sans text-caption text-text-tertiary">avg proximity</span>
        <span className="rounded-full bg-accent-wash px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums text-accent-ink">
          {`${formatPct(summary.girPct)} hit the green`}
        </span>
      </div>
    ) : (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">
          {formatPct(summary.girPct)}
        </span>
        <span className="font-fw-sans text-caption text-text-tertiary">hit the green</span>
      </div>
    );

  const plotLabel =
    plotted === 0
      ? missedAll === 0
        ? `Every approach from ${range} yd hit the green.`
        : `No missed greens from ${range} yd have both a tagged direction and a measured distance.`
      : `${plural(plotted, 'missed green', 'missed greens')} from ${range} yd, placed by tagged direction and measured distance: ${FINISH_ORDER.filter(
          (f) => plottedByFinish[f] > 0,
        )
          .map((f) => `${count(plottedByFinish[f])} ${FINISH_PHRASE[f]}`)
          .join(', ')}.` + (tour ? ` Dashed ring: ${tour.tour} ${formatFeet(tour.ft)}, ${tour.range} yd.` : '');

  const unplotted = [
    hits > 0 ? 'greens hit (no direction; they are on the strip below)' : null,
    untaggedMisses > 0 ? `${plural(untaggedMisses, 'miss', 'misses')} with no direction tag` : null,
    unmeasuredTagged > 0 ? `${plural(unmeasuredTagged, 'tagged miss', 'tagged misses')} with no measured distance` : null,
  ].filter((v): v is string => v != null);

  const stripLabel =
    strip.measured === 0
      ? 'No measured leaves.'
      : `${plural(strip.measured, 'approach', 'approaches')} with a measured leave: ${count(strip.hits)} hit the green, ${count(
          strip.misses,
        )} missed. Average ${formatFeet(strip.avg)}.` + (tour ? ` ${tour.tour} ${formatFeet(tour.ft)}, ${tour.range} yd.` : '');

  const picker = (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Approach distance, yards"
        className="grid grid-cols-4 gap-1 rounded-fw-md border border-border-control bg-surface-sunken p-1 [@container(min-width:560px)]:grid-cols-8"
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
                'relative isolate flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-fw-sm px-1 py-1.5 font-fw-sans',
                on
                  ? 'text-text-on-accent-fill dark:text-accent-ink'
                  : amber
                    ? 'bg-fw-warning-bg text-text-primary'
                    : 'text-text-secondary hover:text-text-primary dark:text-text-primary',
              )}
            >
              {on ? <SegmentedPill quiet layoutId={reduced ? undefined : pillId} reduceMotion={reduced} /> : null}
              <span className="whitespace-nowrap text-caption font-semibold tabular-nums">{o.label}</span>
              <span
                className={cn(
                  'whitespace-nowrap text-caption tabular-nums',
                  on ? 'font-medium' : amber ? 'font-semibold text-fw-warning-text' : 'text-text-tertiary',
                )}
              >
                {o.n === 0 ? 'no shots' : o.proximity == null ? 'no data' : formatFeet(o.proximity)}
              </span>
            </PressTarget>
          );
        })}
      </div>
      {flagged.size > 0 ? (
        <p className="font-fw-sans text-caption text-text-tertiary">
          Amber bands finish further from the pin than the trend across all bands predicts for their distance.
        </p>
      ) : null}
    </div>
  );

  const liePanel = (
    <LiePanel rows={lieRows} lie={lie} overall={bandShots.length > 0 ? overallHit : null} onPick={setLie} />
  );

  return (
    <section
      aria-label="Where approaches finish"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
        className,
      )}
    >
      <Header who={overline} figure={figure} />
      {picker}

      {n === 0 ? (
        <>
          <EmptyState
            variant="subtle"
            title={liePhrase ? `No approaches from ${liePhrase} at ${range} yd` : `No approaches from ${range} yd`}
            description={liePhrase ? 'Pick another lie or distance.' : 'Pick another distance to see where those finished.'}
          />
          {bandShots.length > 0 || lie !== 'all' ? <div className="border-t border-border-subtle pt-4">{liePanel}</div> : null}
        </>
      ) : (
        <>
          <div className="grid gap-5 border-t border-border-subtle pt-4 [@container(min-width:720px)]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] [@container(min-width:720px)]:items-start">
            <div className="flex min-w-0 flex-col gap-2.5">
              <SubHead title="Where the misses went" aside={plotted > 0 ? `${count(plotted)} of ${plural(missedAll, 'miss', 'misses')}` : null} />
              <PinPlot
                groups={groups}
                tour={tour}
                label={plotLabel}
                empty={
                  plotted > 0
                    ? null
                    : missedAll === 0
                      ? 'Every approach here hit the green.'
                      : 'No misses here with both a tagged direction and a measured distance.'
                }
              />
              <div className="flex flex-col gap-1 font-fw-sans text-caption text-text-tertiary">
                {plotted > 0 ? (
                  <p>
                    {`Each mark is a measured distance on a tagged direction. Misses within ${GROUP_FT} ft on one line share a mark, sized by count.`}
                    {far ? ` The outer band holds leaves past ${LINEAR_MAX_FT} ft, not to scale.` : ''}
                  </p>
                ) : null}
                {tour ? (
                  <p data-tour-caption="">{`Dashed ring: ${tour.tour} ${formatFeet(tour.ft)}, ${tour.range} yd, the tour range ${range} yd falls in.`}</p>
                ) : band === 'all' ? (
                  <p>Pick a distance to see the tour average for its range.</p>
                ) : null}
                {unplotted.length > 0 ? <p data-unplotted="">{`Not plotted: ${listOf(unplotted)}.`}</p> : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <FinishBreakdown counts={finishCounts} missed={missedAll} n={n} />
              <figure className="flex min-w-0 flex-col gap-1.5">
                <figcaption className="font-fw-sans text-body-sm font-semibold text-text-primary">
                  {summary.missed > 0 ? `Where ${plural(summary.missed, 'tagged miss', 'tagged misses')} go` : 'Where misses go'}
                </figcaption>
                {summary.missed > 0 ? (
                  <MissRose byDirection={summary.byDirection} missed={summary.missed} />
                ) : (
                  <p className="py-4 font-fw-sans text-caption text-text-tertiary">No tagged misses from {range} yd.</p>
                )}
                {read ? <p className="font-fw-sans text-body-sm text-text-primary">{read}</p> : null}
              </figure>
            </div>
          </div>

          <div className="grid gap-5 border-t border-border-subtle pt-4 [@container(min-width:720px)]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] [@container(min-width:720px)]:items-start">
            <div className="flex min-w-0 flex-col gap-2">
              <SubHead
                title="Distance from the pin"
                aside={`${count(strip.measured)} of ${plural(n, 'shot', 'shots')} measured`}
              />
              {strip.measured === 0 ? (
                <p className="rounded-fw-md bg-surface-sunken px-3 py-4 text-center font-fw-sans text-body-sm text-text-secondary">
                  None of these approaches has a measured leave.
                </p>
              ) : (
                <>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-fw-sans text-caption text-text-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: HIT_FILL }} />
                      {`Hit the green ${count(strip.hits)}, above the line`}
                    </span>
                    <span>{`Missed ${count(strip.misses)}, below`}</span>
                    {strip.untagged > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2.5 rounded-full border border-dashed border-text-tertiary bg-surface" />
                        {`${count(strip.untagged)} with no direction tag`}
                      </span>
                    ) : null}
                  </p>
                  <ProximityStrip model={strip} tour={tour} label={stripLabel} />
                  <p className="font-fw-sans text-caption text-text-tertiary">
                    {`Bars count approaches in ${BIN_FT} ft steps; misses are shaded by where they finished. The line is the average of every measured approach.`}
                  </p>
                </>
              )}
            </div>
            <div className="border-t border-border-subtle pt-4 [@container(min-width:720px)]:border-t-0 [@container(min-width:720px)]:pt-0">
              {liePanel}
            </div>
          </div>
        </>
      )}

      {outside > 0 ? (
        <p data-outside="" className="font-fw-sans text-caption text-text-tertiary">
          {`${plural(outside, 'approach', 'approaches')} in these rounds ${outside === 1 ? 'was' : 'were'} outside ${RANGE_LABEL} yd and ${
            outside === 1 ? "isn't" : "aren't"
          } on this card.`}
        </p>
      ) : null}
    </section>
  );
}
