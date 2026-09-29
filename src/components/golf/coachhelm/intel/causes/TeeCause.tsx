'use client';

/**
 * CoachHelm Home · cause visual for "Off the tee": where drives finish.
 *
 * The hole is five lanes: missed left (rough, then a bunker lane against the
 * fairway), the fairway, and the mirror on the right. Each dot is one drive.
 * Its HEIGHT is the measured length on the yard scale. Its place ACROSS a lane
 * is collision packing (a beeswarm centred in the lane), so a wide band means
 * many drives of that length, never a measured spot. A bunker shape spans the
 * lengths of the drives on that side that finished in sand.
 *
 * Drives with no measured length sit hollow in a tray under the hole, packed
 * by lane; they never get a height. Penalties and misses with no side tagged
 * have no honest place on the hole: the legend and the penalty breakdown count
 * them and the caption says they are not drawn. So is a mis-keyed length far
 * outside the rest (more than three IQRs past the quartiles).
 *
 * The yard scale and the dot size come from the whole slice (every club), so
 * switching All / Driver / Other clubs moves the swarm instead of re-zooming
 * it. Every figure is a count over the slice's shots; nothing is estimated.
 */
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { EmptyState, PressTarget } from '@/components/fairway';
import { SEGMENTED_TRACK_SUNKEN_SHADOW, SegmentedPill } from '@/components/fairway/controls';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { inRounds, teeSummary, type TeeSummary } from '@/lib/golf/team-intelligence/aggregate';
import type { PenaltyType, TeeShot } from '@/lib/golf/team-intelligence/types';
import { formatDecimal, formatPct, type CauseProps } from '../shared';
import { LOW_SAMPLE } from '../theme-stats';

type Club = 'all' | TeeShot['club'];
type Side = 'left' | 'right';
type Lane = 'left-rough' | 'left-sand' | 'fairway' | 'right-sand' | 'right-rough';
type OnMapShot = TeeShot & { zone: 'fairway' | Side };

// ---------------------------------------------------------------------------
// Geometry (viewBox units)
// ---------------------------------------------------------------------------

const W = 400;
/** The field between the yard numbers (left) and the average's label (right). */
const FIELD_L = 32;
const FIELD_R = 368;
/** Lanes, left to right. The bunker lanes sit against the fairway. */
const LANE_X: Record<Lane, readonly [number, number]> = {
  'left-rough': [32, 92],
  'left-sand': [92, 122],
  fairway: [122, 278],
  'right-sand': [278, 308],
  'right-rough': [308, 368],
};
const LANES = Object.keys(LANE_X) as Lane[];
/** Clear space between a lane's edge and its dots. */
const LANE_PAD = 2;
/** The yard scale: the top of the drawn range at SCALE_TOP, the bottom at SCALE_BOT. */
const SCALE_TOP = 18;
const SCALE_BOT = 256;
const FAIRWAY_TOP = 4;
const FAIRWAY_BOT = 268;
const TEE_Y = 276;
const LABEL_Y = 283;
const HOLE_BOT = 296;
/** The tray under the hole for drives with no measured length. */
const TRAY_GAP = 8;
/** Room above the tray's first row for its 12px label at a 375px screen (~0.77px per unit). */
const TRAY_HEAD = 24;
const TRAY_PAD = 6;
/** Clear space between two packed dots. */
const GAP = 0.6;
/** Smallest dot. If even this does not pack, a lane squeezes its offsets to fit. */
const MIN_R = 1.3;
/** Dot radii, largest first: the first one the whole slice packs at wins. */
const RADII = [5.4, 4.6, 3.9, 3.3, 2.8, 2.4, 2.1, 1.85, 1.65, 1.45, MIN_R] as const;
/** Hollow tray dots never shrink below this, so hollow still reads as hollow. */
const TRAY_MIN_R = 3;
/** Narrowest yard window the scale draws (one drive, or all the same). */
const MIN_SPAN_YD = 40;

/**
 * Turf, mixed from tokens into the card surface so the hole reads in both
 * themes: pale cream-greens in light, deep muted greens in dark.
 */
const TURF = {
  rough: 'color-mix(in oklab, var(--fw-viz-seq-3) 20%, var(--fw-color-surface))',
  fairwayA: 'color-mix(in oklab, var(--fw-viz-seq-3) 44%, var(--fw-color-surface))',
  fairwayB: 'color-mix(in oklab, var(--fw-viz-seq-3) 38%, var(--fw-color-surface))',
  edge: 'color-mix(in oklab, var(--fw-viz-seq-3) 62%, var(--fw-color-surface))',
  tee: 'color-mix(in oklab, var(--fw-viz-seq-3) 56%, var(--fw-color-surface))',
  sand: 'color-mix(in oklab, var(--fw-color-warning) 26%, var(--fw-color-surface))',
  sandEdge: 'color-mix(in oklab, var(--fw-color-warning) 48%, var(--fw-color-surface))',
  tray: 'var(--fw-color-surface-sunken)',
  guide: 'color-mix(in oklab, var(--fw-color-text-primary) 20%, transparent)',
  avg: 'color-mix(in oklab, var(--fw-color-text-primary) 72%, transparent)',
} as const;

/** Mark colours. Sand is amber pulled toward the ink, so it reads darker than
 *  the rough's amber in light and paler in dark, and sits 3:1+ on the sand. */
const INK = {
  fairway: 'var(--fw-color-accent-ink)',
  miss: 'var(--fw-viz-div-neg)',
  sand: 'color-mix(in oklab, var(--fw-color-warning) 58%, var(--fw-color-text-primary))',
  noSide: 'var(--fw-color-warning)',
  penalty: 'var(--fw-color-danger)',
} as const;

const LANE_INK: Record<Lane, string> = {
  'left-rough': INK.miss,
  'left-sand': INK.sand,
  fairway: INK.fairway,
  'right-sand': INK.sand,
  'right-rough': INK.miss,
};

const CLUB_LABEL: Record<Club, string> = { all: 'All', driver: 'Driver', other: 'Other clubs' };
const CLUBS: readonly Club[] = ['all', 'driver', 'other'];

const PENALTY_KINDS: readonly { id: PenaltyType; label: string }[] = [
  { id: 'water', label: 'Water' },
  { id: 'ob', label: 'Out of bounds' },
  { id: 'lost', label: 'Lost ball' },
  { id: 'unplayable', label: 'Unplayable' },
  { id: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r2 = (v: number): number => Math.round(v * 100) / 100;
const INT = new Intl.NumberFormat('en-US');
const fmtInt = (n: number): string => INT.format(n);

function plural(n: number, one: string, many: string): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}

/** A percent string for an overlay position; never "NaN%". */
function at(v: number, total: number): string {
  return Number.isFinite(v) && total > 0 ? `${Math.round((v / total) * 10000) / 100}%` : '0%';
}

/** A share of drives: whole percent, with one decimal under 10% so small
 *  rates (penalties) keep their difference. */
function formatRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'None';
  if (value === 0) return '0%';
  return value < 10 ? `${formatDecimal(value, 1)}%` : formatPct(value);
}

function isMeasured(v: number | null): v is number {
  return v != null && Number.isFinite(v) && v > 0;
}

function isOnMap(s: TeeShot): s is OnMapShot {
  return s.zone === 'fairway' || s.zone === 'left' || s.zone === 'right';
}

function laneOf(s: OnMapShot): Lane {
  if (s.zone === 'fairway') return 'fairway';
  const sand = s.lie === 'sand';
  if (s.zone === 'left') return sand ? 'left-sand' : 'left-rough';
  return sand ? 'right-sand' : 'right-rough';
}

const sandLane = (side: Side): Lane => (side === 'left' ? 'left-sand' : 'right-sand');
const laneCx = (lane: Lane): number => (LANE_X[lane][0] + LANE_X[lane][1]) / 2;
/** How far a dot's centre may sit from its lane's centre. */
const laneHalf = (lane: Lane, r: number): number => (LANE_X[lane][1] - LANE_X[lane][0]) / 2 - LANE_PAD - r;

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const lo = sorted[base]!;
  const hi = sorted[Math.min(sorted.length - 1, base + 1)]!;
  return lo + (hi - lo) * (pos - base);
}

// ---------------------------------------------------------------------------
// Yard scale
// ---------------------------------------------------------------------------

interface YardScale {
  lo: number;
  hi: number;
  ticks: number[];
  y: (yards: number) => number;
  inside: (yards: number) => boolean;
}

/**
 * The yard axis over the slice's measured drives: shortest to longest, so
 * the big drives and the duffs both show, except a length more than three
 * IQRs past the quartiles (a mis-keyed drive) is left off. The ends are the
 * shortest and longest drives kept, never the cut-off itself, so a wild
 * value neither stretches the scale nor leaves it ending over empty turf.
 * Snapped outward to 10 yd. Drives outside it are counted in the caption,
 * never drawn at an edge.
 */
function yardScale(yards: readonly number[]): YardScale | null {
  if (yards.length === 0) return null;
  const s = [...yards].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const iqr = Math.max(20, q3 - q1);
  const kept = s.filter((v) => v >= q1 - 3 * iqr && v <= q3 + 3 * iqr);
  let lo = kept[0] ?? q1;
  let hi = kept[kept.length - 1] ?? q3;
  if (hi - lo < MIN_SPAN_YD) {
    const mid = (lo + hi) / 2;
    lo = mid - MIN_SPAN_YD / 2;
    hi = mid + MIN_SPAN_YD / 2;
  }
  lo = Math.max(0, Math.floor(lo / 10) * 10);
  hi = Math.ceil(hi / 10) * 10;
  const span = Math.max(10, hi - lo);
  const step = [10, 20, 25, 50, 100].find((st) => span / st <= 5) ?? 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return {
    lo,
    hi,
    ticks,
    y: (v) => SCALE_BOT - ((v - lo) / span) * (SCALE_BOT - SCALE_TOP),
    inside: (v) => v >= lo && v <= hi,
  };
}

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

interface PackItem {
  key: number;
  y: number;
}

/**
 * Beeswarm: every dot keeps its exact y; its x is the free spot nearest the
 * lane centre (ties alternate sides by key). Processing in y order means only
 * dots within one diameter above can collide. `bounded` keeps every centre
 * within `half` of the centre and returns null when one can't fit; unbounded
 * always places every dot (the furthest candidate is always free).
 */
function swarm(items: readonly PackItem[], cx: number, half: number, r: number, bounded: boolean): Map<number, number> | null {
  const d = 2 * r + GAP;
  const reach = d * d - 1e-6;
  const order = [...items].sort((a, b) => a.y - b.y || a.key - b.key);
  const xs: number[] = [];
  const ys: number[] = [];
  const out = new Map<number, number>();
  const cand: number[] = [];
  let start = 0;
  for (const it of order) {
    while (start < ys.length && it.y - ys[start]! >= d) start += 1;
    cand.length = 0;
    cand.push(cx);
    for (let j = start; j < xs.length; j += 1) {
      const dy = it.y - ys[j]!;
      const dx = Math.sqrt(Math.max(0, d * d - dy * dy));
      cand.push(xs[j]! - dx, xs[j]! + dx);
    }
    const odd = it.key % 2 === 1;
    cand.sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx) || (odd ? b - a : a - b));
    let placed: number | null = null;
    for (const x of cand) {
      if (bounded && Math.abs(x - cx) > half + 1e-6) break;
      let free = true;
      for (let j = start; j < xs.length; j += 1) {
        const ex = xs[j]! - x;
        const ey = ys[j]! - it.y;
        if (ex * ex + ey * ey < reach) {
          free = false;
          break;
        }
      }
      if (free) {
        placed = x;
        break;
      }
    }
    if (placed == null) return null;
    xs.push(placed);
    ys.push(it.y);
    out.set(it.key, placed);
  }
  return out;
}

/** Cheap necessary check before packing: in any y window one diameter tall,
 *  a lane holds at most two staggered rows. */
function denseFits(items: readonly PackItem[], lane: Lane, r: number): boolean {
  const d = 2 * r + GAP;
  const width = 2 * laneHalf(lane, r);
  if (width < 0) return items.length === 0;
  const cap = 2 * (Math.floor(width / d) + 1);
  const ys = items.map((i) => i.y).sort((a, b) => a - b);
  let s = 0;
  for (let e = 0; e < ys.length; e += 1) {
    while (ys[e]! - ys[s]! >= d) s += 1;
    if (e - s + 1 > cap) return false;
  }
  return true;
}

/** Packs one lane at `r`. If it can't fit (never at the slice's own radius,
 *  kept as a guard), packs unbounded and squeezes the offsets into the lane:
 *  dots may overlap, but never leave their lane or change height. */
function packLane(items: readonly PackItem[], lane: Lane, r: number): Map<number, number> {
  const cx = laneCx(lane);
  const half = Math.max(0, laneHalf(lane, r));
  const fit = swarm(items, cx, half, r, true);
  if (fit) return fit;
  const loose = swarm(items, cx, half, r, false)!;
  let spread = 0;
  for (const x of loose.values()) spread = Math.max(spread, Math.abs(x - cx));
  const k = spread > half ? half / spread : 1;
  return new Map([...loose].map(([key, x]) => [key, cx + (x - cx) * k]));
}

const gridPitch = (r: number): number => 2 * r + GAP + 1.2;
const perRow = (lane: Lane, r: number): number =>
  Math.max(1, Math.floor((2 * Math.max(0, laneHalf(lane, r))) / gridPitch(r)) + 1);
const gridRows = (count: number, lane: Lane, r: number): number => Math.ceil(count / perRow(lane, r));

/** Rows of dots centred in a lane; the first row's centre is `y0`, then rows
 *  step by one pitch in `dir`. Layout only: no position here is measured. */
function gridLane(keys: readonly number[], lane: Lane, r: number, y0: number, dir: 1 | -1): { key: number; x: number; y: number }[] {
  const pitch = gridPitch(r);
  const per = perRow(lane, r);
  const cx = laneCx(lane);
  return keys.map((key, i) => {
    const row = Math.floor(i / per);
    const inRow = Math.min(per, keys.length - row * per);
    const col = i - row * per;
    return { key, x: cx + (col - (inRow - 1) / 2) * pitch, y: y0 + dir * row * pitch };
  });
}

// ---------------------------------------------------------------------------
// Plot model
// ---------------------------------------------------------------------------

interface Frame {
  scale: YardScale | null;
  r: number;
}

/** Scale and dot size for the whole slice (every club). */
function frameFor(slice: readonly TeeShot[], keyOf: ReadonlyMap<TeeShot, number>): Frame {
  const onMap = slice.filter(isOnMap);
  const scale = yardScale(onMap.map((s) => s.yards).filter(isMeasured));
  if (!scale) {
    // Nothing has a length: dots stack up from the tee, so the tallest lane's
    // rows must fit the hole.
    const counts = new Map<Lane, number>(LANES.map((l) => [l, 0]));
    for (const s of onMap) counts.set(laneOf(s), counts.get(laneOf(s))! + 1);
    const room = SCALE_BOT - SCALE_TOP;
    const r = RADII.find((rad) => LANES.every((l) => (gridRows(counts.get(l)!, l, rad) - 1) * gridPitch(rad) <= room)) ?? MIN_R;
    return { scale: null, r };
  }
  const byLane = new Map<Lane, PackItem[]>(LANES.map((l) => [l, []]));
  for (const s of onMap) {
    if (!isMeasured(s.yards) || !scale.inside(s.yards)) continue;
    byLane.get(laneOf(s))!.push({ key: keyOf.get(s) ?? 0, y: scale.y(s.yards) });
  }
  const r =
    RADII.find((rad) =>
      LANES.every((l) => {
        const items = byLane.get(l)!;
        return denseFits(items, l, rad) && swarm(items, laneCx(l), laneHalf(l, rad), rad, true) != null;
      }),
    ) ?? MIN_R;
  return { scale, r };
}

interface Dot {
  key: number;
  lane: Lane;
  zone: OnMapShot['zone'];
  sand: boolean;
  measured: boolean;
  yards: number | null;
  x: number;
  y: number;
  r: number;
}

interface Bunker {
  side: Side;
  y0: number;
  y1: number;
}

interface Plot {
  dots: Dot[];
  /** Drives with no length (hollow). */
  hollow: number;
  /** Measured drives outside the yard scale: counted, not drawn. */
  outside: number;
  /** Top of the no-length tray, when there is one. */
  trayTop: number | null;
  height: number;
  bunkers: Bunker[];
}

function placeDots(shots: readonly TeeShot[], frame: Frame, keyOf: ReadonlyMap<TeeShot, number>): Plot {
  const { scale, r } = frame;
  const onMap = shots.filter(isOnMap);
  const dots: Dot[] = [];
  const keyFor = (s: TeeShot) => keyOf.get(s) ?? 0;
  const shape = (s: OnMapShot) => ({
    key: keyFor(s),
    lane: laneOf(s),
    zone: s.zone,
    sand: s.zone !== 'fairway' && s.lie === 'sand',
    yards: isMeasured(s.yards) ? s.yards : null,
  });
  const hollow = new Map<Lane, OnMapShot[]>(LANES.map((l) => [l, []]));
  let outside = 0;

  if (scale) {
    const packed = new Map<Lane, { item: PackItem; shot: OnMapShot }[]>(LANES.map((l) => [l, []]));
    for (const s of onMap) {
      if (!isMeasured(s.yards)) hollow.get(laneOf(s))!.push(s);
      else if (!scale.inside(s.yards)) outside += 1;
      else packed.get(laneOf(s))!.push({ item: { key: keyFor(s), y: scale.y(s.yards) }, shot: s });
    }
    for (const lane of LANES) {
      const list = packed.get(lane)!;
      const xs = packLane(
        list.map((l) => l.item),
        lane,
        r,
      );
      for (const { item, shot } of list) {
        dots.push({ ...shape(shot), measured: true, x: r2(xs.get(item.key) ?? laneCx(lane)), y: r2(item.y), r });
      }
    }
  } else {
    // No drive in the slice has a length: every dot is hollow, stacked up
    // from the tee end of its lane.
    for (const lane of LANES) {
      const list = onMap.filter((s) => laneOf(s) === lane).sort((a, b) => keyFor(a) - keyFor(b));
      const cells = gridLane(list.map(keyFor), lane, r, SCALE_BOT, -1);
      list.forEach((s, i) => dots.push({ ...shape(s), measured: false, x: r2(cells[i]!.x), y: r2(cells[i]!.y), r }));
    }
  }

  let trayTop: number | null = null;
  let height = HOLE_BOT + 4;
  const trayCount = LANES.reduce((sum, l) => sum + hollow.get(l)!.length, 0);
  if (trayCount > 0) {
    const tr = Math.max(r, TRAY_MIN_R);
    trayTop = HOLE_BOT + TRAY_GAP;
    const firstY = trayTop + TRAY_HEAD + tr;
    let rows = 1;
    for (const lane of LANES) {
      const list = hollow.get(lane)!.sort((a, b) => keyFor(a) - keyFor(b));
      if (list.length === 0) continue;
      rows = Math.max(rows, gridRows(list.length, lane, tr));
      const cells = gridLane(list.map(keyFor), lane, tr, firstY, 1);
      list.forEach((s, i) => dots.push({ ...shape(s), measured: false, x: r2(cells[i]!.x), y: r2(cells[i]!.y), r: tr }));
    }
    height = trayTop + TRAY_HEAD + 2 * tr + (rows - 1) * gridPitch(tr) + TRAY_PAD;
  }

  // A bunker spans the lengths of that side's sand dots on the hole, so no
  // sand dot ever sits on grass.
  const bunkers: Bunker[] = [];
  for (const side of ['left', 'right'] as const) {
    const ys = dots.filter((d) => d.lane === sandLane(side) && d.y < HOLE_BOT).map((d) => d.y);
    if (ys.length === 0) continue;
    const pad = r + 10;
    let y0 = Math.max(FAIRWAY_TOP, Math.min(...ys) - pad);
    let y1 = Math.min(FAIRWAY_BOT, Math.max(...ys) + pad);
    if (y1 - y0 < 32) {
      const mid = (y0 + y1) / 2;
      y0 = Math.max(FAIRWAY_TOP, mid - 16);
      y1 = Math.min(FAIRWAY_BOT, y0 + 32);
    }
    bunkers.push({ side, y0: r2(y0), y1: r2(y1) });
  }

  return { dots, hollow: dots.filter((d) => !d.measured).length, outside, trayTop, height: r2(height), bunkers };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface ClubRead {
  club: Club;
  summary: TeeSummary;
  sand: number;
}

function clubRead(club: Club, shots: readonly TeeShot[]): ClubRead {
  return { club, summary: teeSummary(shots), sand: shots.filter((s) => s.zone !== 'fairway' && s.zone !== 'penalty' && s.lie === 'sand').length };
}

/** Where a club's sided misses go. Below the low-sample line it gives the
 *  count, not a share. */
function missSideText(left: number, right: number): string {
  const sided = left + right;
  if (sided === 0) return 'None to a side';
  if (left === right) return 'Even';
  const side = left > right ? 'left' : 'right';
  const top = Math.max(left, right);
  return sided < LOW_SAMPLE ? `${top} of ${sided} ${side}` : `${formatPct((top / sided) * 100)} ${side}`;
}

/** One line on what the driver buys: gaps between the DISPLAYED figures, so
 *  the words and the table always agree. Low samples get no line. */
function clubVerdict(driver: TeeSummary, other: TeeSummary): string | null {
  if (driver.n < LOW_SAMPLE || other.n < LOW_SAMPLE) return null;
  if (driver.avgYards == null || other.avgYards == null || driver.fairwayPct == null || other.fairwayPct == null) return null;
  // From the rounded figures the table shows, so the sentence and the table agree.
  const yd = Math.round(driver.avgYards) - Math.round(other.avgYards);
  const fw = Math.round(driver.fairwayPct) - Math.round(other.fairwayPct);
  const dist = yd === 0 ? 'goes as far as other clubs' : `goes ${Math.abs(yd)} yd ${yd > 0 ? 'longer' : 'shorter'} than other clubs`;
  // Fairway % is a rate, so its gap is in points: fairways per 100 drives, never "% fewer".
  const aim = fw === 0 ? 'hits the fairway as often' : `hits ${Math.abs(fw)} ${fw > 0 ? 'more' : 'fewer'} fairways per 100 drives`;
  return `Driver ${dist} and ${aim}.`;
}

function penaltyKinds(shots: readonly TeeShot[]): { id: PenaltyType; label: string; n: number }[] {
  const counts: Record<PenaltyType, number> = { water: 0, ob: 0, lost: 0, unplayable: 0, other: 0 };
  // A penalty drive with no kind recorded counts as Other.
  for (const s of shots) if (s.zone === 'penalty') counts[s.penaltyType ?? 'other'] += 1;
  return PENALTY_KINDS.map((k, i) => ({ ...k, n: counts[k.id], i }))
    .filter((k) => k.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(({ id, label, n }) => ({ id, label, n }));
}

function formatPerRound(v: number): string {
  if (v === 0) return '0';
  return formatDecimal(v, v < 0.1 ? 2 : 1);
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** HTML label pinned to a viewBox point, so text stays a true 12px at any
 *  drawing scale. */
function Tag({
  x,
  y,
  h,
  align = 'center',
  children,
  className,
}: {
  x: number;
  y: number;
  h: number;
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
  className?: string;
}) {
  const style: CSSProperties = { top: at(y, h) };
  if (align === 'end') style.right = at(W - x, W);
  else style.left = at(x, W);
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
        <h3 className="font-fw-display text-h3 font-semibold text-text-primary">Where drives finish</h3>
        <p className="truncate font-fw-sans text-caption text-text-tertiary">{who}</p>
      </div>
      {figure}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

function ClubCompare({ driver, other, club }: { driver: ClubRead; other: ClubRead; club: Club }) {
  const cols = [driver, other];
  const rows: { id: string; label: string; values: string[] }[] = [
    { id: 'n', label: 'Drives', values: cols.map((c) => fmtInt(c.summary.n)) },
    { id: 'fairway', label: 'Fairways', values: cols.map((c) => formatPct(c.summary.fairwayPct)) },
    {
      id: 'avg',
      label: 'Avg drive',
      values: cols.map((c) => (c.summary.avgYards == null ? 'No length' : `${Math.round(c.summary.avgYards)} yd`)),
    },
    { id: 'miss', label: 'Misses', values: cols.map((c) => missSideText(c.summary.zones.left, c.summary.zones.right)) },
    {
      id: 'penalty',
      label: 'Penalty rate',
      values: cols.map((c) => formatRate(c.summary.n > 0 ? (c.summary.zones.penalty / c.summary.n) * 100 : null)),
    },
  ];
  const verdict = clubVerdict(driver.summary, other.summary);

  return (
    <section aria-label="Driver against other clubs" data-compare="" className="flex min-w-0 flex-col gap-2">
      <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Driver vs other clubs</h4>
      <table className="w-full border-collapse font-fw-sans text-caption">
        <thead>
          <tr>
            <th scope="col" className="pb-1.5 text-left font-medium text-text-tertiary">
              <span className="sr-only">Figure</span>
            </th>
            {cols.map((c) => (
              <th
                key={c.club}
                scope="col"
                data-col={c.club}
                className={cn('pb-1.5 pl-2 text-right font-semibold', club === c.club || club === 'all' ? 'text-text-primary' : 'text-text-tertiary')}
              >
                {CLUB_LABEL[c.club]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-row={row.id} className="border-t border-border-subtle">
              <th scope="row" className="py-1.5 text-left font-medium text-text-tertiary">
                {row.label}
              </th>
              {row.values.map((v, i) => {
                const col = cols[i]!.club;
                return (
                  <td
                    key={col}
                    data-col={col}
                    className={cn(
                      'py-1.5 pl-2 text-right tabular-nums',
                      club === col ? 'font-semibold text-text-primary' : club === 'all' ? 'text-text-primary' : 'text-text-secondary',
                    )}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {verdict ? <p className="font-fw-sans text-body-sm text-text-primary">{verdict}</p> : null}
    </section>
  );
}

function PenaltyBreakdown({ shots, rounds }: { shots: readonly TeeShot[]; rounds: number }) {
  const kinds = penaltyKinds(shots);
  const total = kinds.reduce((sum, k) => sum + k.n, 0);
  const perRound = rounds > 0 ? total / rounds : 0;
  const rate = shots.length > 0 ? (total / shots.length) * 100 : null;

  return (
    <section aria-label="Penalties off the tee" data-penalties="" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Penalties</h4>
        <span className="font-fw-sans text-caption text-text-secondary">
          <span data-per-round="" className="font-semibold tabular-nums text-text-primary">
            {formatPerRound(perRound)}
          </span>{' '}
          per round
        </span>
      </div>
      {total > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {kinds.map((k) => (
            <li
              key={k.id}
              data-penalty-kind={k.id}
              className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_2rem] items-center gap-2 font-fw-sans text-caption"
            >
              <span className="truncate text-text-secondary">{k.label}</span>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <span className="block h-full rounded-full" style={{ width: `${r2((k.n / total) * 100)}%`, background: INK.penalty }} />
              </span>
              <span className="text-right font-semibold tabular-nums text-text-primary">{fmtInt(k.n)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-fw-sans text-body-sm text-text-secondary">No penalties off the tee.</p>
      )}
      <p data-penalty-note="" className="font-fw-sans text-caption text-text-tertiary">
        {total > 0
          ? `${plural(total, 'penalty', 'penalties')} in ${plural(rounds, 'round', 'rounds')} with a tracked drive; ${formatRate(rate)} of drives.`
          : `Over ${plural(rounds, 'round', 'rounds')} with a tracked drive.`}
        {kinds.some((k) => k.id === 'other') ? ' Other includes penalties with no kind recorded.' : ''}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TeeCause
// ---------------------------------------------------------------------------

export function TeeCause({ data, allowed, playerId, playerName, className }: CauseProps) {
  const [club, setClub] = useState<Club>('all');
  const rawId = useId();
  const svgId = `tee-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const reduced = useReducedMotionGuard() ?? false;

  // Payload index per shot: the stable key and packing tie-break.
  const keyOf = useMemo(() => new Map<TeeShot, number>(data.tee.map((s, i) => [s, i])), [data.tee]);
  const slice = useMemo(() => inRounds(data.tee, allowed, data.rounds, playerId), [data.tee, allowed, data.rounds, playerId]);
  const frame = useMemo(() => frameFor(slice, keyOf), [slice, keyOf]);
  const reads = useMemo(
    () => ({
      all: clubRead('all', slice),
      driver: clubRead(
        'driver',
        slice.filter((s) => s.club === 'driver'),
      ),
      other: clubRead(
        'other',
        slice.filter((s) => s.club === 'other'),
      ),
    }),
    [slice],
  );
  const rounds = useMemo(() => new Set(slice.map((s) => s.ri)).size, [slice]);
  const shots = useMemo(() => (club === 'all' ? slice : slice.filter((s) => s.club === club)), [slice, club]);
  const plot = useMemo(() => placeDots(shots, frame, keyOf), [shots, frame, keyOf]);

  const who = playerName ?? 'Whole team';

  if (slice.length === 0) {
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

  const { summary, sand: sandTotal } = reads[club];
  const n = summary.n;
  const { zones, avgYards, fairwayPct } = summary;
  const avg = avgYards != null && Number.isFinite(avgYards) ? Math.round(avgYards) : null;
  const share = (count: number) => (n > 0 ? (count / n) * 100 : 0);
  const sand = { left: 0, right: 0, miss: 0 };
  for (const s of shots) if (s.lie === 'sand' && (s.zone === 'left' || s.zone === 'right' || s.zone === 'miss')) sand[s.zone] += 1;
  const sided = zones.left + zones.right;
  // Shown, not judged: the lead side is only named past the low-sample line.
  const lead: Side | null = sided < LOW_SAMPLE || zones.left === zones.right ? null : zones.left > zones.right ? 'left' : 'right';
  const scale = frame.scale;
  const avgY = scale && avg != null && scale.inside(avg) ? r2(scale.y(avg)) : null;
  const pillId = `${svgId}-club`;
  const whoLine = `${who} · ${plural(n, 'drive', 'drives')}${club === 'all' ? '' : ` · ${CLUB_LABEL[club]}`}`;

  const figure =
    n === 0 ? null : avg != null ? (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">
          {avg} yd
        </span>
        <span className="font-fw-sans text-caption text-text-tertiary">avg drive</span>
        <span className="rounded-full bg-accent-wash px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums text-accent-ink">
          {formatPct(fairwayPct)} fairways
        </span>
      </div>
    ) : (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">
          {formatPct(fairwayPct)}
        </span>
        <span className="font-fw-sans text-caption text-text-tertiary">fairways hit</span>
        {zones.penalty > 0 ? (
          <span
            data-figure-penalties=""
            className="rounded-full bg-surface-sunken px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums text-text-secondary"
          >
            {plural(zones.penalty, 'penalty', 'penalties')}
          </span>
        ) : null}
      </div>
    );

  const picker = (
    <div
      role="group"
      aria-label="Club off the tee"
      className="grid grid-cols-3 gap-1 rounded-fw-md border border-border-control bg-surface-sunken p-1"
      style={{ boxShadow: SEGMENTED_TRACK_SUNKEN_SHADOW }}
    >
      {CLUBS.map((id) => {
        const on = id === club;
        const t = reads[id].summary;
        const yd = t.avgYards == null ? null : Math.round(t.avgYards);
        // Stacked on a narrow card so neither figure is ever cut off; one line from 400px.
        const parts = t.n === 0 ? ['No drives'] : [formatPct(t.fairwayPct), yd == null ? 'fairways' : `${yd} yd`];
        const aria =
          t.n === 0
            ? `${CLUB_LABEL[id]}: no drives`
            : `${CLUB_LABEL[id]}: ${plural(t.n, 'drive', 'drives')}, ${formatPct(t.fairwayPct)} fairways${yd == null ? '' : `, ${yd} yd average`}`;
        return (
          <PressTarget
            key={id}
            aria-pressed={on}
            aria-label={aria}
            haptic="select"
            data-club={id}
            onClick={() => setClub(id)}
            className={cn(
              'relative isolate flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-fw-sm px-1 py-1.5 font-fw-sans',
              on ? 'text-text-on-accent-fill dark:text-accent-ink' : 'text-text-secondary hover:text-text-primary dark:text-text-primary',
            )}
          >
            {on ? <SegmentedPill quiet layoutId={reduced ? undefined : pillId} reduceMotion={reduced} /> : null}
            <span className="max-w-full truncate text-caption font-semibold">{CLUB_LABEL[id]}</span>
            <span
              className={cn(
                'flex max-w-full flex-col items-center text-caption leading-tight tabular-nums [@container(min-width:400px)]:flex-row [@container(min-width:400px)]:gap-1',
                on ? 'font-medium' : 'text-text-tertiary',
              )}
            >
              {parts.map((p, i) => (
                <span key={p} className="max-w-full truncate">
                  {i === 1 && yd != null ? <span className="hidden [@container(min-width:400px)]:inline"> · </span> : null}
                  {i === 1 && yd == null ? ' ' : null}
                  {p}
                </span>
              ))}
            </span>
          </PressTarget>
        );
      })}
    </div>
  );

  const compare =
    reads.driver.summary.n > 0 && reads.other.summary.n > 0 ? (
      <ClubCompare driver={reads.driver} other={reads.other} club={club} />
    ) : (
      <section aria-label="Driver against other clubs" data-compare="" className="flex min-w-0 flex-col gap-2">
        <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Driver vs other clubs</h4>
        <p className="font-fw-sans text-body-sm text-text-secondary">
          {reads.driver.summary.n > 0
            ? `Every drive here was hit with driver (${plural(reads.driver.summary.n, 'drive', 'drives')}).`
            : `No drive here was hit with driver (${plural(reads.other.summary.n, 'drive', 'drives')} with other clubs).`}
        </p>
      </section>
    );

  const notDrawn: { id: string; text: string }[] = [];
  if (zones.penalty > 0) notDrawn.push({ id: 'penalty', text: plural(zones.penalty, 'penalty', 'penalties') });
  if (zones.miss > 0) notDrawn.push({ id: 'miss', text: `${plural(zones.miss, 'miss', 'misses')} with no side tagged` });
  if (plot.outside > 0 && scale) {
    notDrawn.push({ id: 'outside', text: `${plural(plot.outside, 'drive', 'drives')} outside ${scale.lo}–${scale.hi} yd` });
  }

  const ariaLabel =
    `${plural(n, 'drive', 'drives')}: ${fmtInt(zones.fairway)} in the fairway, ` +
    `${fmtInt(zones.left)} missed left (${fmtInt(sand.left)} in a bunker), ` +
    `${fmtInt(zones.right)} missed right (${fmtInt(sand.right)} in a bunker)` +
    (zones.miss > 0 ? `, ${fmtInt(zones.miss)} missed with no side tagged` : '') +
    `, ${plural(zones.penalty, 'penalty', 'penalties')}.` +
    (avg != null ? ` Average drive ${avg} yd.` : '');

  const groups: { id: string; parts: { id: string; n: number; color: string }[] }[] = [
    {
      id: 'left',
      parts: [
        { id: 'left-rough', n: zones.left - sand.left, color: INK.miss },
        { id: 'left-sand', n: sand.left, color: INK.sand },
      ],
    },
    { id: 'fairway', parts: [{ id: 'fairway', n: zones.fairway, color: INK.fairway }] },
    {
      id: 'right',
      parts: [
        { id: 'right-sand', n: sand.right, color: INK.sand },
        { id: 'right-rough', n: zones.right - sand.right, color: INK.miss },
      ],
    },
    {
      id: 'miss',
      parts: [
        { id: 'miss-other', n: zones.miss - sand.miss, color: INK.noSide },
        { id: 'miss-sand', n: sand.miss, color: INK.sand },
      ],
    },
    { id: 'penalty', parts: [{ id: 'penalty', n: zones.penalty, color: INK.penalty }] },
  ];

  // The first entries split the drives (they add up to the whole). The bunker
  // is a part of the misses, as in the bar, so it sits on its own line and says so.
  const legend: { id: string; label: string; count: number; color: string; note?: string }[] = [
    { id: 'left', label: 'Missed left', count: zones.left, color: INK.miss },
    { id: 'fairway', label: 'Fairway', count: zones.fairway, color: INK.fairway },
    { id: 'right', label: 'Missed right', count: zones.right, color: INK.miss },
    ...(zones.miss > 0 ? [{ id: 'miss', label: 'Missed, no side', count: zones.miss, color: INK.noSide }] : []),
    { id: 'penalty', label: 'Penalty', count: zones.penalty, color: INK.penalty },
    { id: 'sand', label: 'Fairway bunker', count: sandTotal, color: INK.sand, note: '· part of the misses' },
  ];

  const byLane = new Map<Lane, Dot[]>(LANES.map((l) => [l, []]));
  for (const d of plot.dots) byLane.get(d.lane)!.push(d);
  const H = plot.height;
  const sideLabelX = (side: Side) => (side === 'left' ? (LANE_X['left-rough'][0] + LANE_X['left-sand'][1]) / 2 : (LANE_X['right-sand'][0] + LANE_X['right-rough'][1]) / 2);

  return (
    <section
      aria-label="Where drives finish"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
        className,
      )}
    >
      <Header who={whoLine} figure={figure} />
      {picker}

      {n === 0 ? (
        <EmptyState
          variant="subtle"
          title={club === 'driver' ? 'No driver shots in these rounds' : 'No drives with other clubs in these rounds'}
          description="Pick All to see every drive."
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="relative mx-auto w-full max-w-[600px]" style={{ aspectRatio: `${W} / ${H}` }}>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="absolute inset-0 block size-full">
                <defs>
                  <pattern id={`${svgId}-mow`} width={W} height={24} patternUnits="userSpaceOnUse">
                    <rect width={W} height={12} style={{ fill: TURF.fairwayA }} />
                    <rect y={12} width={W} height={12} style={{ fill: TURF.fairwayB }} />
                  </pattern>
                </defs>

                {/* The hole: rough, the mown fairway, the bunkers, the tee. */}
                <rect x={FIELD_L} y={0} width={FIELD_R - FIELD_L} height={HOLE_BOT} rx={8} style={{ fill: TURF.rough }} />
                <rect
                  x={LANE_X.fairway[0]}
                  y={FAIRWAY_TOP}
                  width={LANE_X.fairway[1] - LANE_X.fairway[0]}
                  height={FAIRWAY_BOT - FAIRWAY_TOP}
                  rx={12}
                  fill={`url(#${svgId}-mow)`}
                  style={{ stroke: TURF.edge }}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                {plot.bunkers.map((b) => {
                  const [x0, x1] = LANE_X[sandLane(b.side)];
                  return (
                    <rect
                      key={b.side}
                      data-bunker={b.side}
                      x={x0 + 1}
                      y={b.y0}
                      width={x1 - x0 - 2}
                      height={r2(b.y1 - b.y0)}
                      rx={(x1 - x0 - 2) / 2}
                      style={{ fill: TURF.sand, stroke: TURF.sandEdge }}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
                <rect
                  x={W / 2 - 13}
                  y={TEE_Y}
                  width={26}
                  height={12}
                  rx={3}
                  style={{ fill: TURF.tee, stroke: TURF.edge }}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />

                {scale?.ticks.map((t) => {
                  const y = r2(scale.y(t));
                  return (
                    <line
                      key={t}
                      x1={FIELD_L}
                      x2={FIELD_R}
                      y1={y}
                      y2={y}
                      style={{ stroke: TURF.guide }}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}

                {plot.trayTop != null ? (
                  <rect
                    data-tray=""
                    x={FIELD_L}
                    y={plot.trayTop}
                    width={FIELD_R - FIELD_L}
                    height={r2(H - plot.trayTop - 2)}
                    rx={8}
                    style={{ fill: TURF.tray }}
                  />
                ) : null}

                {LANES.map((lane) => (
                  <g key={lane} data-lane={lane} data-x0={LANE_X[lane][0]} data-x1={LANE_X[lane][1]}>
                    {byLane.get(lane)!.map((d) => (
                      <circle
                        key={d.key}
                        cx={d.x}
                        cy={d.y}
                        r={d.r}
                        data-zone={d.zone}
                        data-lie={d.sand ? 'sand' : undefined}
                        data-measured={d.measured ? 'true' : 'false'}
                        data-yards={d.yards ?? undefined}
                        style={
                          d.measured
                            ? { fill: LANE_INK[lane] }
                            : { fill: 'var(--fw-color-surface)', stroke: LANE_INK[lane] }
                        }
                        strokeWidth={d.measured ? undefined : 1.25}
                        vectorEffect={d.measured ? undefined : 'non-scaling-stroke'}
                      />
                    ))}
                  </g>
                ))}

                {avgY != null ? (
                  <line
                    data-avg-line=""
                    x1={FIELD_L}
                    x2={FIELD_R}
                    y1={avgY}
                    y2={avgY}
                    style={{ stroke: TURF.avg }}
                    strokeWidth={1.25}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>

              {scale?.ticks.map((t) => (
                <Tag key={t} x={FIELD_L - 5} y={scale.y(t)} h={H} align="end" className="tabular-nums text-text-tertiary">
                  {t}
                </Tag>
              ))}
              {avgY != null ? (
                <Tag x={FIELD_R + 5} y={avgY} h={H} align="start" className="font-semibold text-text-primary">
                  Avg
                </Tag>
              ) : null}
              <Tag x={sideLabelX('left')} y={LABEL_Y} h={H} className="font-medium">
                Missed left
              </Tag>
              <Tag x={sideLabelX('right')} y={LABEL_Y} h={H} className="font-medium">
                Missed right
              </Tag>
              {plot.trayTop != null ? (
                <Tag x={FIELD_L + 7} y={plot.trayTop} h={H} align="start" className="translate-y-[3px] font-medium">
                  No length
                </Tag>
              ) : null}
            </div>

            <p data-caption="" className="font-fw-sans text-caption text-text-tertiary">
              {scale ? (
                <span>Height is each drive&apos;s measured length; across a zone is packing, not a measured spot.</span>
              ) : (
                <span>No drive lengths were measured, so dots are packed by zone only.</span>
              )}
              {scale && plot.hollow > 0 ? <span> Hollow dots had no length measured.</span> : null}
              {notDrawn.length > 0 ? (
                <span>
                  {' '}
                  Not drawn:{' '}
                  {notDrawn.map((part, i) => (
                    <span key={part.id}>
                      <span data-offmap={part.id}>{part.text}</span>
                      {i < notDrawn.length - 2 ? ', ' : i === notDrawn.length - 2 ? ' and ' : '.'}
                    </span>
                  ))}
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <div aria-hidden className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
              {groups
                .filter((g) => g.parts.some((p) => p.n > 0))
                .map((g) => {
                  const total = g.parts.reduce((sum, p) => sum + p.n, 0);
                  return (
                    <span key={g.id} data-bar={g.id} className="flex h-full" style={{ width: `${r2(share(total))}%` }}>
                      {g.parts
                        .filter((p) => p.n > 0)
                        .map((p) => (
                          <span key={p.id} className="h-full" style={{ width: `${r2((p.n / total) * 100)}%`, background: p.color }} />
                        ))}
                    </span>
                  );
                })}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {legend.map((l) => {
                const isLead = l.id === lead;
                return (
                  <li
                    key={l.id}
                    data-legend={l.id}
                    className={cn('inline-flex items-center gap-1.5 font-fw-sans text-caption', l.note && 'basis-full')}
                  >
                    <Swatch color={l.color} />
                    <span data-lead={isLead ? '' : undefined} className={isLead ? 'font-semibold text-text-primary' : 'text-text-secondary'}>
                      {l.label}
                    </span>
                    <span className="font-semibold tabular-nums text-text-primary">{formatRate(share(l.count))}</span>
                    <span className="tabular-nums text-text-tertiary">({fmtInt(l.count)})</span>
                    {l.note ? <span className="text-text-tertiary">{l.note}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <div className="grid gap-5 border-t border-border-subtle pt-4 [@container(min-width:540px)]:grid-cols-2 [@container(min-width:540px)]:gap-6">
        {compare}
        {n > 0 ? <PenaltyBreakdown shots={shots} rounds={rounds} /> : null}
      </div>
    </section>
  );
}
