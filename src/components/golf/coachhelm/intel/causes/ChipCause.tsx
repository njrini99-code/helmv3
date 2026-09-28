'use client';

/**
 * Around the green: "Where scrambles are lost".
 *
 * The slice's first-chip up and down against a reference, a lie × distance
 * grid that filters the read, where the first chips finished (one dot per
 * chip) and what each leave was worth.
 *
 * The reference. The whole team is read against tour scrambling from the same
 * lie (`data.refs.scrambling`: live `golf_pga_standards` rows for the team's
 * tour); the headline weights each chip by its own lie's tour figure, so the
 * comparison follows the slice's lie mix. Tour scrambling counts par saves
 * after a missed green, close to but not the same as this card's first-chip
 * up and down, and the caption says so. A lie with no tour figure gets no tour
 * mark and its chips leave the comparison. A player is read against the whole
 * team in the same lie and distance.
 *
 * The dot plot. Leaves are logged to the whole foot, so each dot sits inside
 * its logged foot (within FOOT_SPREAD_FT, never across the 4 ft make-zone
 * edge) and packs up and down; spread within a foot and height are layout
 * only, and the legend says so. A fractional leave keeps the same rule around
 * its exact value and swaps the note. Leaves of 30 ft or more share a
 * labelled lane.
 *
 * The card covers chips from inside 30 yd (the grid's range) so the headline,
 * grid, dot plot and leave bars always reconcile; anything longer is counted
 * in the footnote.
 */
import { Fragment, useId, useLayoutEffect, useMemo, useState } from 'react';
import { EmptyState, PressTarget } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  CHIP_BANDS,
  CHIP_LIES,
  approachSummary,
  chipSummary,
  chipsIn,
  inRounds,
  type ChipBandId,
} from '@/lib/golf/team-intelligence/aggregate';
import type { ChipLie, ChipShot, IntelTourRefs } from '@/lib/golf/team-intelligence/types';
import { formatPct, type CauseProps } from '../shared';

/** Below this many chips a figure is shown but not judged. */
const LOW_N = 5;
/** The grid's reach: chips from this far or more are outside the card. */
const GRID_MAX_YD = Math.max(...CHIP_BANDS.map((b) => b.max));

const SAVED_FILL = 'var(--fw-viz-div-pos)';
const MISSED_FILL = 'var(--fw-viz-div-neg)';
/** The reference line (tour or team): dashed, in the primary ink. */
const REF_STROKE = 'var(--fw-color-text-primary)';

const wash = (token: string, pct: number) =>
  `color-mix(in oklab, var(${token}) ${pct}%, var(--fw-color-surface-sunken))`;

/** How a grid cell reads against its reference. */
type Judgement = 'lossStrong' | 'loss' | 'even' | 'gain' | 'unjudged';

/** A cell's fill is its up and down; the fill's colour is the judgement:
 *  amber below the reference (deeper at 15 pts or more), green above it,
 *  grey within 5 pts, a paler grey when there is no reference or too few
 *  chips to judge. No text sits on a fill, so the fills can be strong. */
const LEVEL: Record<Judgement, { fill: string; line: string }> = {
  lossStrong: { fill: wash('--fw-viz-div-neg', 52), line: MISSED_FILL },
  loss: { fill: wash('--fw-viz-div-neg', 30), line: MISSED_FILL },
  even: { fill: wash('--fw-color-text-tertiary', 26), line: 'var(--fw-color-text-tertiary)' },
  gain: { fill: wash('--fw-viz-div-pos', 36), line: SAVED_FILL },
  unjudged: { fill: wash('--fw-color-text-tertiary', 16), line: 'var(--fw-color-border-strong)' },
};

/** Lie swatches (decorative). */
const LIE_SWATCH: Record<ChipLie, string> = {
  fairway: 'color-mix(in oklab, var(--fw-color-accent-500) 70%, var(--fw-color-surface))',
  rough: 'color-mix(in oklab, var(--fw-color-accent-500) 45%, var(--fw-color-warm-600))',
  sand: 'color-mix(in oklab, var(--fw-color-warning) 60%, var(--fw-color-surface))',
};

/** Make zone band in the dot plot (inside 4 ft). */
const ZONE_FILL = 'color-mix(in oklab, var(--fw-color-accent-500) 14%, var(--fw-color-surface))';
const ZONE_EDGE = 'color-mix(in oklab, var(--fw-color-accent-500) 40%, var(--fw-color-surface))';
/** The 30+ lane's backdrop: not a linear stretch of the axis. */
const LANE_FILL = 'color-mix(in oklab, var(--fw-color-text-tertiary) 9%, var(--fw-color-surface))';
/** A leave bar with too few chips to judge. */
const THIN_FILL = 'color-mix(in oklab, var(--fw-color-text-tertiary) 45%, var(--fw-color-surface-sunken))';

const FEET = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const feet = (v: number) => `${FEET.format(v)} ft`;
const yards = (v: number) => `${Math.round(v)} yd`;
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const clampPct = (v: number) => Math.min(100, Math.max(0, v));
/** The 2px level line sits on the fill's top edge, inside the gauge at 0% and 100%. */
const levelBottom = (pct: number) => (clampPct(pct) <= 2 ? '0px' : `calc(${clampPct(pct)}% - 2px)`);
/** Keeps a phrase on one line ("600 chips", "avg 13 yd"). */
const keep = (s: string) => s.replace(/ /g, ' ');
/** A grid cell's gauge: 0 to 100% up and down, below the cell's text so the
 *  lines never cross a figure. Every gauge in a row has the same height and
 *  baseline, so a lie's tour line runs level across its row. */
const GAUGE_FILL = 'color-mix(in oklab, var(--fw-color-text-tertiary) 8%, var(--fw-color-surface-sunken))';

type Tone = 'neutral' | 'loss' | 'gain';
const PILL_TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  loss: 'bg-fw-warning-bg text-fw-warning-ink',
  gain: 'bg-accent-wash text-accent-ink',
};
const PILL =
  'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums';

function upAndDown(shots: readonly ChipShot[]): number | null {
  return shots.length ? (shots.filter((s) => s.saved).length / shots.length) * 100 : null;
}

function meanYards(shots: readonly ChipShot[]): number | null {
  return shots.length ? shots.reduce((sum, s) => sum + s.fromYards, 0) / shots.length : null;
}

/** Gap in whole points between two DISPLAYED percentages, so the words and
 *  the figures on screen always agree. */
function pointGap(value: number | null, ref: number | null): number | null {
  return value == null || ref == null ? null : Math.round(value) - Math.round(ref);
}

function judge(n: number, gap: number | null): Judgement {
  if (n < LOW_N || gap == null) return 'unjudged';
  if (gap <= -15) return 'lossStrong';
  if (gap <= -5) return 'loss';
  if (gap >= 5) return 'gain';
  return 'even';
}

/** "Fairway", "fairway and rough", "fairway, rough and sand". */
function lieList(lies: readonly ChipLie[]): string {
  const names = lies.map((id) => (CHIP_LIES.find((l) => l.id === id)?.label ?? id).toLowerCase());
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------------------
// Tour reference
// ---------------------------------------------------------------------------

type Scrambling = IntelTourRefs['scrambling'];

/** The tour's scrambling % from a lie; null (no mark) when the row is missing. */
function tourRef(scrambling: Scrambling, lie: ChipLie): number | null {
  const v = scrambling[lie];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

interface TourRead {
  /** Chips whose lie has a tour figure: the only chips compared. */
  covered: number;
  /** Up and down over those chips. */
  coveredPct: number | null;
  /** The tour figure weighted by those chips' lies: Σ tour % of each chip's lie / covered. */
  expected: number | null;
  /** Lies in the slice with a tour figure / without one (CHIP_LIES order). */
  lies: ChipLie[];
  missing: ChipLie[];
}

function tourRead(shots: readonly ChipShot[], scrambling: Scrambling): TourRead {
  let covered = 0;
  let saved = 0;
  let sum = 0;
  const present = new Set<ChipLie>();
  for (const s of shots) {
    present.add(s.lie);
    const ref = tourRef(scrambling, s.lie);
    if (ref == null) continue;
    covered += 1;
    sum += ref;
    if (s.saved) saved += 1;
  }
  const inSlice = CHIP_LIES.map((l) => l.id).filter((id) => present.has(id));
  return {
    covered,
    coveredPct: covered ? (saved / covered) * 100 : null,
    expected: covered ? sum / covered : null,
    lies: inSlice.filter((id) => tourRef(scrambling, id) != null),
    missing: inSlice.filter((id) => tourRef(scrambling, id) == null),
  };
}

function gapPill(gap: number, against: string): { text: string; tone: Tone } {
  if (gap === 0) return { text: `Level with ${against}`, tone: 'neutral' };
  const pts = `${Math.abs(gap)} ${plural(Math.abs(gap), 'pt')}`;
  return {
    text: `${pts} ${gap < 0 ? 'below' : 'above'} ${against}`,
    tone: gap <= -3 ? 'loss' : gap >= 3 ? 'gain' : 'neutral',
  };
}

/** "Misses mostly short · 63% of 8 tagged", from the chips' tagged misses;
 *  null without five tagged misses or a clear lean. */
function missLean(shots: readonly ChipShot[]): string | null {
  const s = approachSummary(shots);
  if (s.missed < LOW_N) return null;
  const ranked = (['short', 'long', 'left', 'right'] as const)
    .map((k) => ({ k, n: s.misses[k] }))
    .sort((a, b) => b.n - a.n);
  const top = ranked[0]!;
  if (top.n === ranked[1]!.n || top.n * 2 < s.missed) return null;
  return `Misses mostly ${top.k} · ${formatPct((top.n / s.missed) * 100)} of ${s.missed} tagged`;
}

// ---------------------------------------------------------------------------
// What the leave was worth
// ---------------------------------------------------------------------------

/** First-chip leaves. Each band runs up to, not including, the next one's
 *  start, the same convention as the grid's 0–10 / 10–20 yd bands: an 8 ft
 *  leave is in 8–15 ft. */
const LEAVE_BANDS = [
  { id: 'in4', label: 'Inside 4 ft', min: Number.NEGATIVE_INFINITY, max: 4 },
  { id: '4', label: '4–8 ft', min: 4, max: 8 },
  { id: '8', label: '8–15 ft', min: 8, max: 15 },
  { id: '15', label: '15+ ft', min: 15, max: Number.POSITIVE_INFINITY },
] as const;
type LeaveBandId = (typeof LEAVE_BANDS)[number]['id'];

interface LeaveWorth {
  id: LeaveBandId;
  label: string;
  n: number;
  pct: number | null;
}

/** Up and down by first-chip leave, over chips with a measured leave. */
function leaveWorth(shots: readonly ChipShot[]): LeaveWorth[] {
  return LEAVE_BANDS.map((b) => {
    const inBand = shots.filter((s) => s.leaveFeet != null && s.leaveFeet >= b.min && s.leaveFeet < b.max);
    return { id: b.id, label: b.label, n: inBand.length, pct: upAndDown(inBand) };
  });
}

function LeaveWorthBars({ rows, team }: { rows: readonly LeaveWorth[]; team: readonly LeaveWorth[] | null }) {
  return (
    <ul aria-label="Up and down by first-chip leave" className="flex flex-col gap-3">
      {rows.map((b, i) => {
        const thin = b.n < LOW_N;
        const t = team?.[i];
        const teamPct = t && t.n > 0 ? t.pct : null;
        return (
          <li
            key={b.id}
            data-leave-band={b.id}
            data-n={b.n}
            className="grid grid-cols-[5.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 [@container(min-width:480px)]:grid-cols-[7rem_minmax(0,1fr)_3rem]"
          >
            <span className="flex min-w-0 flex-col">
              <span className="font-fw-sans text-body-sm font-medium text-text-primary">{b.label}</span>
              <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                {b.n === 0 ? 'no chips' : thin ? `${b.n} · low sample` : `${b.n} ${plural(b.n, 'chip')}`}
              </span>
            </span>
            <span aria-hidden className="relative block h-3 rounded-full bg-surface-sunken">
              {b.n > 0 && b.pct != null ? (
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${clampPct(b.pct)}%`, background: thin ? THIN_FILL : SAVED_FILL }}
                />
              ) : null}
              {teamPct != null ? (
                <span
                  data-team-tick=""
                  className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-text-primary"
                  style={{ left: `${clampPct(teamPct)}%` }}
                />
              ) : null}
            </span>
            <span
              className={cn(
                'text-right font-fw-sans text-body-sm font-semibold tabular-nums',
                thin ? 'text-text-tertiary' : 'text-text-primary',
              )}
            >
              {b.n === 0 ? null : formatPct(b.pct)}
              {teamPct != null ? <span className="sr-only">{`, whole team ${formatPct(teamPct)}`}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Dot plot of first-chip leaves
// ---------------------------------------------------------------------------

/** Make zone: leaves inside 4 ft (logged 0 to 3 ft). */
const ZONE_FT = 4;
/** Leaves this long or longer share the labelled 30+ lane. */
const LANE_FT = 30;
/** Leaves are logged to the whole foot. A dot sits within this far either
 *  side of its leave, never across the make-zone edge; exactly where is
 *  layout, as is its height. 0 would stack each foot in a single column. */
const FOOT_SPREAD_FT = 0.4;

/** True when every leave on the axis is a whole foot, as logged today. The
 *  make-zone edge is then drawn between 3 and 4 ft; a fractional leave moves
 *  it to 4 ft itself and changes the layout note. */
function wholeFeet(leaves: readonly { feet: number }[]): boolean {
  return leaves.every((l) => l.feet >= LANE_FT || Number.isInteger(l.feet));
}

const DOTS = {
  labelRow: 20,
  padTop: 6,
  padBottom: 6,
  axisBand: 20,
  laneW: 30,
  laneGap: 12,
  padR: 2,
  rMin: 1.75,
} as const;

interface PackItem {
  home: number;
  lo: number;
  hi: number;
}

/**
 * Beeswarm packing with a horizontal window per dot. Dots are placed in
 * order of `home`; each takes the free spot nearest the centre line, anywhere
 * inside [lo, hi], without touching a placed dot (centres `d` apart). With
 * lo = hi it is the classic one-column beeswarm.
 */
function packSwarm(items: readonly PackItem[], d: number): { x: number; y: number }[] {
  const placed: { x: number; y: number }[] = [];
  const buckets = new Map<number, number[]>();
  const minD2 = d * d - 1e-6;
  items.forEach((it, i) => {
    const at = Math.min(it.hi, Math.max(it.lo, it.home));
    const xs = [at];
    if (it.hi - it.lo >= 0.5) {
      xs.push(it.lo, it.hi);
      for (let x = it.lo + d / 2; x < it.hi - 0.25; x += d / 2) xs.push(x);
    }
    const pool: number[] = [];
    for (let b = Math.floor((it.lo - d) / d); b <= Math.floor((it.hi + d) / d); b += 1) {
      const list = buckets.get(b);
      if (list) pool.push(...list);
    }
    let best = { x: at, y: 0 };
    let bestAbs = Number.POSITIVE_INFINITY;
    let bestDx = Number.POSITIVE_INFINITY;
    const up = i % 2 === 0;
    for (const x of xs) {
      const near = pool.filter((j) => Math.abs(placed[j]!.x - x) < d);
      const ys = [0];
      for (const j of near) {
        const p = placed[j]!;
        const h = Math.sqrt(Math.max(0, d * d - (p.x - x) ** 2));
        ys.push(p.y + h, p.y - h);
      }
      ys.sort((a, b) => Math.abs(a) - Math.abs(b) || (up ? b - a : a - b));
      for (const y of ys) {
        if (Math.abs(y) > bestAbs + 1e-9) break;
        const clear = near.every((j) => {
          const p = placed[j]!;
          return (p.x - x) ** 2 + (p.y - y) ** 2 >= minD2;
        });
        if (!clear) continue;
        const dx = Math.abs(x - it.home);
        if (Math.abs(y) < bestAbs - 1e-9 || dx < bestDx) {
          best = { x, y };
          bestAbs = Math.abs(y);
          bestDx = dx;
        }
        break;
      }
    }
    placed.push(best);
    const key = Math.floor(best.x / d);
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  });
  return placed;
}

interface DotLayout {
  dots: { key: number; cx: number; cy: number; ft: number; saved: boolean }[];
  r: number;
  height: number;
  /** x of 0 ft and the scale: a foot is `pxPerFt` wide. */
  x0: number;
  pxPerFt: number;
  axisR: number;
  laneL: number;
  laneR: number;
  zoneL: number;
  zoneR: number;
  top: number;
  axisY: number;
}

/**
 * Lays the dots out for a width. Starts at a comfortable radius and shrinks
 * the dots (not below rMin) until the swarm fits its height budget; past
 * that the chart grows taller. Dots never overlap and never leave their foot.
 */
function layoutDots(leaves: readonly { feet: number; saved: boolean }[], width: number, dense: boolean): DotLayout {
  const maxHalf = dense ? 60 : 44;
  // Whole-foot leaves: the zone edge falls between logged 3 ft and 4 ft.
  const edgeFt = wholeFeet(leaves) ? ZONE_FT - 0.5 : ZONE_FT;
  const attempt = (r: number) => {
    const gap = Math.max(0.6, r * 0.3);
    const d = 2 * r + gap;
    const x0 = r + 3;
    const laneR = width - DOTS.padR;
    const laneL = laneR - DOTS.laneW;
    const axisR = laneL - DOTS.laneGap;
    const pxPerFt = Math.max(1, (axisR - x0) / (LANE_FT - 0.5));
    const x = (ft: number) => x0 + ft * pxPerFt;
    const zoneR = x(edgeFt);
    const items = leaves
      .map((l, key) => {
        const f = Math.max(0, l.feet);
        if (f >= LANE_FT) return { key, home: (laneL + laneR) / 2, lo: laneL + r, hi: laneR - r };
        // Within FOOT_SPREAD_FT of the leave, on the leave's own side of the zone edge.
        const inZone = f < ZONE_FT;
        const edge = inZone ? zoneR - r - gap / 2 : zoneR + r + gap / 2;
        let lo = x(Math.max(0, f - FOOT_SPREAD_FT));
        let hi = x(Math.min(LANE_FT - 0.5, f + FOOT_SPREAD_FT));
        if (inZone) hi = Math.min(hi, edge);
        else lo = Math.max(lo, edge);
        if (hi < lo) {
          // Only when a dot is wider than the spread: it sits on the edge.
          lo = edge;
          hi = edge;
        }
        return { key, home: Math.min(hi, Math.max(lo, x(f))), lo, hi };
      })
      .sort((a, b) => a.home - b.home || a.key - b.key);
    const points = packSwarm(items, d);
    const half = points.reduce((m, p) => Math.max(m, Math.abs(p.y)), 0) + r;
    return { r, items, points, half, x0, pxPerFt, axisR, laneL, laneR, zoneR };
  };
  let fit = attempt(dense ? 3 : 4);
  for (let tries = 0; fit.half > maxHalf && fit.r > DOTS.rMin && tries < 4; tries += 1) {
    fit = attempt(Math.max(DOTS.rMin, fit.r * Math.sqrt(maxHalf / fit.half) * 0.97));
  }
  const half = Math.max(fit.half, 14);
  const top = DOTS.labelRow;
  const mid = top + DOTS.padTop + half;
  const axisY = mid + half + DOTS.padBottom;
  return {
    dots: fit.items.map((it, k) => ({
      key: it.key,
      cx: fit.points[k]!.x,
      cy: mid + fit.points[k]!.y,
      ft: leaves[it.key]!.feet,
      saved: leaves[it.key]!.saved,
    })),
    r: fit.r,
    height: axisY + DOTS.axisBand,
    x0: fit.x0,
    pxPerFt: fit.pxPerFt,
    axisR: fit.axisR,
    laneL: fit.laneL,
    laneR: fit.laneR,
    zoneL: fit.x0 - fit.r - 2,
    zoneR: fit.zoneR,
    top,
    axisY,
  };
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

function LeaveDots({
  leaves,
  median,
  dense,
  label,
}: {
  leaves: readonly { feet: number; saved: boolean }[];
  median: number | null;
  dense: boolean;
  label: string;
}) {
  const [ref, width] = useMeasuredWidth(320);
  const layout = useMemo(() => layoutDots(leaves, width, dense), [leaves, width, dense]);
  const { dots, r, height, x0, pxPerFt, axisR, laneL, laneR, zoneL, zoneR, top, axisY } = layout;
  const step = pxPerFt * 5 >= 28 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t < LANE_FT; t += step) ticks.push(t);
  const medianX =
    median == null ? null : median >= LANE_FT ? (laneL + laneR) / 2 : x0 + Math.max(0, median) * pxPerFt;
  const medianAnchor =
    medianX == null ? 'middle' : medianX < 44 ? 'start' : medianX > width - 44 ? 'end' : 'middle';
  const breakX = (axisR + laneL) / 2;

  return (
    <div ref={ref} className="w-full min-w-0">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible font-fw-sans"
        data-x0={x0}
        data-px-per-ft={pxPerFt}
      >
        <rect
          data-make-zone=""
          x={zoneL}
          y={top}
          width={Math.max(0, zoneR - zoneL)}
          height={axisY - top}
          rx={6}
          style={{ fill: ZONE_FILL }}
        />
        <line x1={zoneR} x2={zoneR} y1={top + 4} y2={axisY} strokeWidth={1} style={{ stroke: ZONE_EDGE }} />
        <rect data-lane="" x={laneL} y={top} width={laneR - laneL} height={axisY - top} rx={6} style={{ fill: LANE_FILL }} />
        <line x1={x0 - r} x2={axisR} y1={axisY} y2={axisY} style={{ stroke: 'var(--fw-color-border-strong)' }} />
        <line x1={laneL} x2={laneR} y1={axisY} y2={axisY} style={{ stroke: 'var(--fw-color-border-strong)' }} />
        <path
          d={`M${breakX - 5} ${axisY + 4} L${breakX - 1} ${axisY - 4} M${breakX + 1} ${axisY + 4} L${breakX + 5} ${axisY - 4}`}
          strokeWidth={1}
          style={{ stroke: 'var(--fw-color-border-strong)', fill: 'none' }}
        />
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x0 + t * pxPerFt}
              x2={x0 + t * pxPerFt}
              y1={axisY}
              y2={axisY + 4}
              style={{ stroke: 'var(--fw-color-border-strong)' }}
            />
            <text
              x={x0 + t * pxPerFt}
              y={axisY + DOTS.axisBand - 3}
              fontSize={11}
              textAnchor="middle"
              style={{ fill: 'var(--fw-color-text-tertiary)' }}
            >
              {t}
            </text>
          </g>
        ))}
        <text
          x={laneR}
          y={axisY + DOTS.axisBand - 3}
          fontSize={11}
          textAnchor="end"
          style={{ fill: 'var(--fw-color-text-tertiary)' }}
        >
          30+ ft
        </text>
        {dots.map((d) => (
          <circle
            key={d.key}
            data-ft={d.ft}
            data-saved={d.saved ? '' : undefined}
            cx={d.cx}
            cy={d.cy}
            r={r}
            style={{ fill: d.saved ? SAVED_FILL : MISSED_FILL }}
          />
        ))}
        {medianX != null && median != null ? (
          <g data-median={median}>
            <line
              x1={medianX}
              x2={medianX}
              y1={top - 4}
              y2={axisY}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              style={{ stroke: 'var(--fw-color-text-primary)' }}
            />
            <text
              x={medianX}
              y={12}
              fontSize={11}
              fontWeight={600}
              textAnchor={medianAnchor}
              style={{ fill: 'var(--fw-color-text-primary)' }}
            >
              {`median ${feet(median)}`}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function ChipCause({ data, allowed, playerId, playerName, className }: CauseProps) {
  const [band, setBand] = useState<ChipBandId | 'all'>('all');
  const [lie, setLie] = useState<ChipLie | 'all'>('all');
  const headingId = useId();
  const isPlayer = playerId != null;
  const tourLabel = data.tourLabel;

  const read = useMemo(() => {
    const scrambling = data.refs.scrambling;
    const all = inRounds(data.chips, allowed, data.rounds, playerId);
    const inGrid = (s: ChipShot) => s.fromYards >= 0 && s.fromYards < GRID_MAX_YD;
    const shots = all.filter(inGrid);
    const team = playerId ? inRounds(data.chips, allowed, data.rounds, null).filter(inGrid) : shots;
    const filtered = chipsIn(shots, band, lie);
    const teamFiltered = chipsIn(team, band, lie);
    const rows = CHIP_LIES.map((l) => {
      const list = chipsIn(shots, 'all', l.id);
      return { lie: l, n: list.length, avgYd: meanYards(list), tour: playerId ? null : tourRef(scrambling, l.id) };
    });
    const cells = rows.map((row) =>
      CHIP_BANDS.map((b) => {
        const mine = chipsIn(shots, b.id, row.lie.id);
        const pct = upAndDown(mine);
        // A player's reference is the whole team in the same cell; the whole
        // team's is the tour's scrambling from that lie (any distance).
        const ref = playerId ? upAndDown(chipsIn(team, b.id, row.lie.id)) : row.tour;
        const gap = mine.length >= LOW_N ? pointGap(pct, ref) : null;
        return { lie: row.lie, band: b, n: mine.length, pct, ref, gap, judgement: judge(mine.length, gap) };
      }),
    );
    return {
      total: all.length,
      beyond: all.length - shots.length,
      grid: shots.length,
      rows,
      colN: Object.fromEntries(CHIP_BANDS.map((b) => [b.id, chipsIn(shots, b.id, 'all').length])) as Record<
        ChipBandId,
        number
      >,
      cells,
      summary: chipSummary(filtered),
      teamSummary: chipSummary(teamFiltered),
      avgYd: meanYards(filtered),
      tour: playerId ? null : tourRead(filtered, scrambling),
      noLeave: filtered.filter((s) => s.leaveFeet == null).length,
      lean: missLean(filtered),
      worth: leaveWorth(filtered),
      teamWorth: playerId ? leaveWorth(teamFiltered) : null,
    };
  }, [data, allowed, playerId, band, lie]);

  const { summary } = read;
  const who = playerName ?? (isPlayer ? 'Player' : 'Whole team');
  const bandLabel = band === 'all' ? null : (CHIP_BANDS.find((b) => b.id === band)?.label ?? null);
  const lieLabel = lie === 'all' ? null : (CHIP_LIES.find((l) => l.id === lie)?.label ?? null);
  // Each part stays on one line and a wrap only falls after a separator, so a
  // line never starts with "·". A player's name may still wrap.
  const overline = [
    who,
    ...[
      `${summary.n} ${plural(summary.n, 'chip')}`,
      bandLabel,
      lieLabel?.toLowerCase() ?? null,
      band === 'all' && read.avgYd != null ? `avg ${yards(read.avgYd)}` : null,
    ]
      .filter((part): part is string => Boolean(part))
      .map(keep),
  ].join(' · ');
  const filtering = band !== 'all' || lie !== 'all';

  // Headline comparison: a player against the whole team (same filter); the
  // whole team against the tour, lie by lie, over the chips with a tour figure.
  let pill: { text: string; tone: Tone } | null = null;
  let refLine: string | null = null;
  const lowSample = { text: `Low sample · ${summary.n} ${plural(summary.n, 'chip')}`, tone: 'neutral' as const };
  if (summary.n === 0) {
    pill = { text: 'No chips', tone: 'neutral' };
  } else if (isPlayer) {
    const gap = pointGap(summary.upAndDownPct, read.teamSummary.upAndDownPct);
    pill = summary.n < LOW_N ? lowSample : gap == null ? null : gapPill(gap, 'team');
    refLine = read.teamSummary.n > 0 ? `Whole team ${formatPct(read.teamSummary.upAndDownPct)}` : null;
  } else if (read.tour && read.tour.covered > 0) {
    const t = read.tour;
    const gap = pointGap(t.coveredPct, t.expected);
    // The pill says "tour"; the line under it names which tour and its figure.
    pill = summary.n < LOW_N ? lowSample : t.covered < LOW_N || gap == null ? null : gapPill(gap, 'tour');
    refLine =
      t.missing.length === 0
        ? `${tourLabel} ${formatPct(t.expected)} from these lies`
        : `${capitalise(lieList(t.lies))} ${formatPct(t.coveredPct)} vs ${tourLabel} ${formatPct(t.expected)}`;
  } else if (summary.n < LOW_N) {
    pill = lowSample;
  }

  const rowsWithChips = read.rows.filter((r) => r.n > 0);
  const rowsWithoutTour = rowsWithChips.filter((r) => r.tour == null).map((r) => r.lie.id);
  const gridCaption = isPlayer
    ? 'Dashed line: the whole team from the same lie and distance.'
    : rowsWithChips.length > 0 && rowsWithoutTour.length === rowsWithChips.length
      ? `No ${tourLabel} scrambling figure for these lies, so there is no tour comparison.`
      : [
          `Dashed line: ${tourLabel} scrambling from that lie, any distance. Tour counts par saves: close to, not the same as, up and down.`,
          rowsWithoutTour.length
            ? `No ${tourLabel} ${lieList(rowsWithoutTour)} figure, so ${lieList(rowsWithoutTour)} chips have no tour comparison.`
            : null,
        ]
          .filter(Boolean)
          .join(' ');

  const pickCell = (b: ChipBandId, l: ChipLie) => {
    if (band === b && lie === l) {
      setBand('all');
      setLie('all');
    } else {
      setBand(b);
      setLie(l);
    }
  };

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={headingId} className="font-fw-display text-h3 font-semibold text-text-primary">
          Where scrambles are lost
        </h3>
        <p className="font-fw-sans text-caption text-text-tertiary">{overline}</p>
      </div>
      {read.grid > 0 ? (
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
          {/* A row and a column can each have chips while the cell they share
              has none: then there is no figure, only the "No chips" pill. */}
          {summary.n > 0 ? (
            <>
              <span
                data-figure=""
                className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary"
              >
                {formatPct(summary.upAndDownPct)}
              </span>
              <span className="font-fw-sans text-caption text-text-tertiary">up and down</span>
            </>
          ) : null}
          {pill ? <span className={cn(PILL, PILL_TONE[pill.tone])}>{pill.text}</span> : null}
          {refLine ? (
            <span
              data-ref-headline=""
              className="-mt-0.5 max-w-32 text-balance font-fw-sans text-caption tabular-nums text-text-secondary [@container(min-width:480px)]:max-w-none"
            >
              {refLine}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (read.grid === 0) {
    return (
      <section
        aria-labelledby={headingId}
        className={cn(
          'flex min-w-0 flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
          className,
        )}
      >
        {header}
        <EmptyState
          variant="subtle"
          title={read.total > 0 ? `No chips inside ${GRID_MAX_YD} yd` : 'No chips in this slice'}
          description={
            read.total > 0
              ? `Every chip in these rounds was from ${GRID_MAX_YD} yd or more, outside this card's grid.`
              : `No tracked chips in these rounds yet. They show up here once rounds are logged shot by shot.`
          }
        />
      </section>
    );
  }

  const leaves = summary.leaves;
  const savedLeaves = leaves.filter((l) => l.saved).length;
  const inLane = leaves.filter((l) => l.feet >= LANE_FT).length;
  // Names every drawn position that is layout rather than measured.
  const whole = wholeFeet(leaves);
  const layoutNote = `${
    whole ? 'Leaves are logged to the foot' : `Dots sit near their measured leave, never across the ${ZONE_FT} ft line`
  }; ${[whole ? 'spread within a foot' : 'exact spot', inLane > 0 ? `place in the ${LANE_FT}+ lane` : null]
    .filter(Boolean)
    .join(', ')} and height are layout only.`;
  const dotsLabel =
    leaves.length === 0
      ? 'No first-chip leaves on the green'
      : `First-chip leaves: ${leaves.length} ${plural(leaves.length, 'chip')} on the green, median ${feet(
          summary.medianLeave ?? 0,
        )}, ${formatPct(summary.inside4Pct)} inside 4 ft. ${savedLeaves} got up and down, ${
          leaves.length - savedLeaves
        } missed.${inLane ? ` ${inLane} at ${LANE_FT} ft or more.` : ''}`;
  const footnote = [
    read.noLeave > 0 && leaves.length > 0
      ? `${read.noLeave} ${plural(read.noLeave, 'chip')} with no measured leave ${
          read.noLeave === 1 ? 'counts' : 'count'
        } toward up and down but ${read.noLeave === 1 ? "isn't" : "aren't"} plotted.`
      : null,
    read.beyond > 0
      ? `${read.beyond} ${plural(read.beyond, 'chip')} from ${GRID_MAX_YD} yd or more ${
          read.beyond === 1 ? 'is' : 'are'
        } outside this card.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-5 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
        className,
      )}
    >
      {header}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Up and down by lie and distance</h4>
          <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">
            {filtering ? 'Tap again to clear' : 'Tap to filter'}
          </span>
        </div>
        <div
          role="group"
          aria-label="Up and down by lie and distance"
          className="grid grid-cols-3 gap-1.5 [@container(min-width:560px)]:grid-cols-[9rem_repeat(3,minmax(0,1fr))] [@container(min-width:560px)]:gap-2"
        >
          <span aria-hidden className="hidden [@container(min-width:560px)]:block" />
          {CHIP_BANDS.map((b) => {
            const on = band === b.id;
            const n = read.colN[b.id];
            const blocked = n === 0 && !on;
            return (
              <PressTarget
                key={b.id}
                haptic={!blocked}
                aria-pressed={on}
                aria-disabled={blocked || undefined}
                aria-label={`${b.label}, all lies`}
                onClick={() => {
                  if (!blocked) setBand(on ? 'all' : b.id);
                }}
                className={cn(
                  'flex min-h-10 min-w-0 flex-col items-center justify-end rounded-fw-sm px-1 pb-1 font-fw-sans text-caption tabular-nums [@media(pointer:coarse)]:min-h-11',
                  on ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
                  blocked && 'cursor-default',
                )}
              >
                <span className={cn('font-semibold', on ? 'text-text-primary' : 'text-text-secondary')}>{b.label}</span>
                <span className="text-text-tertiary">{n === 0 ? 'no chips' : `${n} ${plural(n, 'chip')}`}</span>
              </PressTarget>
            );
          })}
          {read.rows.map((row, li) => {
            const l = row.lie;
            const rowOn = lie === l.id;
            const rowBlocked = row.n === 0 && !rowOn;
            return (
              <Fragment key={l.id}>
                <PressTarget
                  haptic={!rowBlocked}
                  aria-pressed={rowOn}
                  aria-disabled={rowBlocked || undefined}
                  aria-label={`${l.label}, all distances`}
                  onClick={() => {
                    if (!rowBlocked) setLie(rowOn ? 'all' : l.id);
                  }}
                  className={cn(
                    'col-span-3 mt-2 flex min-w-0 items-center gap-3 rounded-fw-sm px-1 py-1 text-left font-fw-sans',
                    '[@container(min-width:560px)]:col-span-1 [@container(min-width:560px)]:mt-0 [@container(min-width:560px)]:flex-col [@container(min-width:560px)]:items-start [@container(min-width:560px)]:justify-center [@container(min-width:560px)]:gap-1.5 [@container(min-width:560px)]:px-2',
                    rowOn ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
                    rowBlocked && 'cursor-default',
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        'flex items-center gap-1.5 text-body-sm text-text-primary',
                        rowOn ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: LIE_SWATCH[l.id] }} />
                      {l.label}
                    </span>
                    <span className="text-caption tabular-nums text-text-tertiary">
                      {row.n === 0
                        ? 'no chips'
                        : `${row.n} ${plural(row.n, 'chip')}${row.avgYd != null ? ` · avg ${yards(row.avgYd)}` : ''}`}
                    </span>
                  </span>
                  {row.tour != null ? (
                    <span
                      data-tour-ref={row.tour}
                      className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-caption tabular-nums text-text-secondary [@container(min-width:560px)]:ml-0"
                    >
                      <span aria-hidden className="w-3.5" style={{ borderTop: `1.5px dashed ${REF_STROKE}` }} />
                      {`${tourLabel} ${formatPct(row.tour)}`}
                    </span>
                  ) : null}
                </PressTarget>
                {read.cells[li]!.map((c) => {
                  const on = band === c.band.id && lie === c.lie.id;
                  const blocked = c.n === 0 && !on;
                  const thin = c.n < LOW_N;
                  const level = LEVEL[c.judgement];
                  const refText =
                    c.ref == null ? '' : isPlayer ? `, team ${formatPct(c.ref)}` : `, ${tourLabel} scrambling ${formatPct(c.ref)}`;
                  const state = thin ? `${c.n} ${plural(c.n, 'chip')}, low sample` : `${c.n} chips`;
                  return (
                    <PressTarget
                      key={c.band.id}
                      haptic={!blocked}
                      aria-pressed={on}
                      aria-disabled={blocked || undefined}
                      aria-label={`${c.lie.label}, ${c.band.label}: ${
                        c.n === 0 ? 'no chips' : `${formatPct(c.pct)} up and down, ${state}${refText}`
                      }`}
                      data-judgement={c.n === 0 ? undefined : c.judgement}
                      onClick={() => {
                        if (!blocked) pickCell(c.band.id, c.lie.id);
                      }}
                      className={cn(
                        'relative flex min-w-0 flex-col items-start gap-1 overflow-hidden rounded-fw-md bg-surface-sunken px-2 pb-16 pt-2 text-left',
                        '[@container(min-width:560px)]:px-3 [@container(min-width:560px)]:pb-[4.5rem] [@container(min-width:560px)]:pt-3',
                        on ? 'ring-2 ring-text-primary' : 'ring-1 ring-border-subtle',
                        blocked && 'cursor-default',
                      )}
                    >
                      {c.n > 0 ? (
                        <span
                          className={cn(
                            'font-fw-sans text-h3 font-semibold leading-none tabular-nums [@container(min-width:560px)]:text-h2',
                            thin ? 'text-text-tertiary' : 'text-text-primary',
                          )}
                        >
                          {formatPct(c.pct)}
                        </span>
                      ) : null}
                      <span className="font-fw-sans text-caption leading-tight tabular-nums text-text-secondary">
                        {c.n === 0 ? (
                          'no chips'
                        ) : thin ? (
                          <>
                            <span className="whitespace-nowrap">{c.n} ·</span>{' '}
                            <span className="whitespace-nowrap">low sample</span>
                          </>
                        ) : (
                          `${c.n} chips`
                        )}
                      </span>
                      {c.n > 0 ? (
                        <span
                          aria-hidden
                          data-gauge=""
                          className="absolute inset-x-0 bottom-0 h-14 [@container(min-width:560px)]:h-16"
                          style={{ background: GAUGE_FILL }}
                        >
                          {c.pct != null ? (
                            <>
                              <span
                                data-fill={Math.round(c.pct)}
                                className="absolute inset-x-0 bottom-0"
                                style={{ height: `${clampPct(c.pct)}%`, background: level.fill }}
                              />
                              <span
                                className="absolute inset-x-0 h-0.5"
                                style={{ bottom: levelBottom(c.pct), background: level.line }}
                              />
                            </>
                          ) : null}
                          {c.ref != null ? (
                            <span
                              data-ref-line={c.ref}
                              className="absolute inset-x-0"
                              style={{ bottom: `${clampPct(c.ref)}%`, borderTop: `1.5px dashed ${REF_STROKE}` }}
                            />
                          ) : null}
                        </span>
                      ) : null}
                    </PressTarget>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
        <p className="font-fw-sans text-caption text-text-tertiary">{gridCaption}</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Where the first chip finished</h4>
          {leaves.length > 0 ? (
            <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
              {`${formatPct(summary.inside4Pct)} of ${leaves.length} inside 4 ft`}
              {isPlayer ? ` · team ${formatPct(read.teamSummary.inside4Pct)}` : ''}
            </span>
          ) : null}
        </div>
        {summary.n === 0 ? (
          <p className="rounded-fw-md bg-surface-sunken px-3 py-4 text-center font-fw-sans text-body-sm text-text-secondary">
            No chips match this filter.
          </p>
        ) : leaves.length === 0 ? (
          <p className="rounded-fw-md bg-surface-sunken px-3 py-4 text-center font-fw-sans text-body-sm text-text-secondary">
            None of these chips finished on the green.
          </p>
        ) : (
          <LeaveDots leaves={leaves} median={summary.medianLeave} dense={!isPlayer} label={dotsLabel} />
        )}
        {leaves.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: SAVED_FILL }} />
                Got up and down
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: MISSED_FILL }} />
                Missed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-3.5 rounded-fw-sm"
                  style={{ background: ZONE_FILL, boxShadow: `inset 0 0 0 1px ${ZONE_EDGE}` }}
                />
                Make zone, inside 4 ft
              </span>
              {read.lean ? <span className="text-text-tertiary">{read.lean}</span> : null}
            </div>
            <p className="font-fw-sans text-caption text-text-tertiary">{layoutNote}</p>
          </div>
        ) : null}
      </div>

      {leaves.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">What the leave was worth</h4>
            <span className="font-fw-sans text-caption text-text-tertiary">
              {isPlayer ? 'Up and down · tick is the whole team' : 'Up and down by first-chip leave'}
            </span>
          </div>
          <LeaveWorthBars rows={read.worth} team={read.teamWorth} />
        </div>
      ) : null}

      {footnote ? <p className="-mt-2 font-fw-sans text-caption text-text-tertiary">{footnote}</p> : null}
    </section>
  );
}
