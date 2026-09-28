'use client';

/**
 * Putting: "How putts miss".
 *
 * Reads top-down: make % for the slice, make % by length against the tour
 * (the hero, and the length filter), lag putting from 15 ft and out, where
 * the tagged misses finish around the hole, and make % by break and slope.
 * A length or a break × slope cell filters the rest of the card.
 *
 * Honesty rules this card keeps:
 * - Tour marks come only from `data.refs.puttMake` (the live
 *   golf_pga_standards rows for the team's tour). A null ref draws no mark.
 *   Inside 3 ft has no standard, so it never has one.
 * - A length is judged (gap in points) only with LOW_N putts, the benchmark
 *   module's floor, and only while no break / slope filter is on: the tour
 *   figure covers every putt at that length, not a downhill subset. Smaller
 *   samples are drawn hollow and not compared.
 * - Each miss on the green sits at its MEASURED leave (the next putt's
 *   length) in its TAGGED direction: low side left, high side right, short
 *   toward the golfer, long past the hole, a two-tag miss on the diagonal.
 *   Putts are logged in whole feet, so many misses share one spot; a spot is
 *   one circle whose area is its count, with the share of its missed FIRST
 *   putts that led to a 3-putt as an arc on its outline (only first putts
 *   carry the 3-putt flag, so other misses never count toward it). Leaves of
 *   4 ft or more share the outer ring. Untagged misses and tagged misses with
 *   no leave are counted in the copy instead of guessed. Ring labels are
 *   layout only: they take whichever half-angle keeps them off the spots.
 */
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { EmptyState, PressTarget } from '@/components/fairway';
import { DURATION, EASE_CINEMATIC, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { PUTTING_BENCHMARK_MIN_SAMPLE } from '@/lib/golf/benchmarks/putting';
import {
  PUTT_BANDS,
  PUTT_BREAKS,
  PUTT_SLOPES,
  inRounds,
  mean,
  puttSummary,
  puttsIn,
  type PuttBandId,
} from '@/lib/golf/team-intelligence/aggregate';
import type { PuttBreak, PuttShot, PuttSlope } from '@/lib/golf/team-intelligence/types';
import { SG_TONE_TEXT, formatFeet, formatPct, type CauseProps } from '../shared';

/** A length, a lag range or a break × slope cell is judged once it has this
 *  many putts: the benchmark module's floor (display registry `floor: 10`). */
const LOW_N = PUTTING_BENCHMARK_MIN_SAMPLE;

const COUNT = new Intl.NumberFormat('en-US');
const fmtCount = (n: number) => COUNT.format(n);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const MINUS = '−';
/** Keeps "10–15 ft" on one line in running copy. */
const unbroken = (s: string) => s.replace(/ ft\b/g, '\u00a0ft');

// ---------------------------------------------------------------------------
// Colour (tokens only, so light and dark both hold)
// ---------------------------------------------------------------------------

const BAR = 'var(--fw-color-accent-500)';
/** The other lengths while one is picked. */
const BAR_DIM = 'color-mix(in oklab, var(--fw-color-accent-500) 36%, var(--fw-color-surface))';
const TOUR_MARK = 'var(--fw-viz-benchmark)';
/** The stretch between the team's make % and the tour mark, when behind. */
const SHORTFALL = 'color-mix(in oklab, var(--fw-viz-div-neg) 30%, transparent)';
const THREE_PUTT = 'var(--fw-viz-div-neg)';

/** Turf, mixed from the accent token so the green follows light and dark. */
const TURF = 'color-mix(in oklab, var(--fw-color-accent-500) 30%, var(--fw-color-surface-sunken))';
const TURF_HI = 'color-mix(in oklab, var(--fw-color-accent-500) 20%, var(--fw-color-surface))';
/** Ring and axis lines: primary ink at low strength, dark on light turf and light on dark turf. */
const TURF_LINE = 'color-mix(in oklab, var(--fw-color-text-primary) 24%, transparent)';
/** The dominant miss direction's half of the green: a shade, not a colour (amber means 3-putt here). */
const LEAN_FILL = 'color-mix(in oklab, var(--fw-color-text-primary) 8%, transparent)';

/** Where a lag finished, nearest to farthest. */
const LAG_TONE = {
  holed: 'var(--fw-ramp-4)',
  close: 'var(--fw-ramp-3)',
  mid: 'color-mix(in oklab, var(--fw-color-text-tertiary) 45%, var(--fw-color-surface))',
  far: 'var(--fw-viz-div-neg)',
} as const;

const TINT = {
  lossStrong: 'color-mix(in oklab, var(--fw-viz-div-neg) 24%, var(--fw-color-surface-sunken))',
  loss: 'color-mix(in oklab, var(--fw-viz-div-neg) 12%, var(--fw-color-surface-sunken))',
  gain: 'color-mix(in oklab, var(--fw-viz-div-pos) 16%, var(--fw-color-surface-sunken))',
} as const;

const PILL =
  'inline-flex items-center whitespace-nowrap rounded-full bg-surface-sunken px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums text-text-secondary';

// ---------------------------------------------------------------------------
// Lengths
// ---------------------------------------------------------------------------

type BandSel = PuttBandId | 'in3' | 'all';
type Direction = 'low' | 'high' | 'short' | 'long';

interface BandDef {
  id: Exclude<BandSel, 'all'>;
  /** Axis label, feet implied ("5–10"). */
  label: string;
  /** Sentence form ("5–10 ft", "Inside 3 ft"). */
  long: string;
  /** `refs.puttMake` key; null = no tour standard. */
  ref: string | null;
}

/** Inside 3 ft is not an aggregate band (no standard), so it lives here. */
const INSIDE_3: BandDef = { id: 'in3', label: '0–3', long: 'Inside 3 ft', ref: null };
const LENGTHS: readonly BandDef[] = PUTT_BANDS.map((b) => ({ id: b.id, label: b.label, long: `${b.label} ft`, ref: b.ref }));
const LAG_IDS: readonly PuttBandId[] = ['15', '25'];

function bandPutts(
  putts: readonly PuttShot[],
  band: BandSel,
  brk: PuttBreak | 'all' = 'all',
  slope: PuttSlope | 'all' = 'all',
): PuttShot[] {
  if (band !== 'in3') return puttsIn(putts, band, brk, slope);
  return puttsIn(putts, 'all', brk, slope).filter((p) => p.feet < PUTT_BANDS[0].min);
}

/** The gap between the two whole numbers on screen, so "10% vs 6%" reads +4. */
function pointGap(value: number | null, ref: number | null): number | null {
  return value == null || ref == null ? null : Math.round(value) - Math.round(ref);
}

function signed(gap: number): string {
  return gap > 0 ? `+${gap}` : gap < 0 ? `${MINUS}${-gap}` : '0';
}

/** A gap inside 3 points is printed in neutral ink: close enough to read as level. */
function gapTone(gap: number): 'loss' | 'gain' | 'flat' {
  return gap <= -3 ? 'loss' : gap >= 3 ? 'gain' : 'flat';
}

function cellTint(gap: number | null): string | undefined {
  if (gap == null) return undefined;
  if (gap <= -8) return TINT.lossStrong;
  if (gap <= -3) return TINT.loss;
  if (gap >= 5) return TINT.gain;
  return undefined;
}

interface LengthRead {
  def: BandDef;
  n: number;
  make: number | null;
  /** Tour make % from refs (drawn as the mark), null when there is none. */
  tour: number | null;
  /** Points vs tour, only when judged (n ≥ LOW_N, a tour ref, no break / slope filter). */
  gap: number | null;
  thin: boolean;
  aria: string;
}

// ---------------------------------------------------------------------------
// Lag
// ---------------------------------------------------------------------------

interface LagRead {
  id: PuttBandId;
  label: string;
  /** First putts from the range. */
  n: number;
  holed: number;
  /** Missed first putts by measured leave: under 3 ft, 3 to 6 ft, 6 ft or more. */
  close: number;
  mid: number;
  far: number;
  /** Holed plus misses with a measured leave: the finishes we know. */
  known: number;
  /** Missed first putts with no next putt recorded. */
  noLeave: number;
  /** Mean leave of missed first putts (the next putt's length). */
  avgLeave: number | null;
  /** Holed or left under 3 ft, per known finish. */
  closePct: number | null;
  threePutts: number;
  threePuttPct: number | null;
}

function lagRead(id: PuttBandId, label: string, putts: readonly PuttShot[]): LagRead {
  const firsts = putts.filter((p) => p.first);
  const holed = firsts.filter((p) => p.made).length;
  const missed = firsts.filter((p) => !p.made);
  const leaves = missed.map((p) => p.leaveFeet).filter((v): v is number => v != null && Number.isFinite(v));
  const close = leaves.filter((l) => l < 3).length;
  const mid = leaves.filter((l) => l >= 3 && l < 6).length;
  const far = leaves.length - close - mid;
  const known = holed + leaves.length;
  const threePutts = firsts.filter((p) => p.threePutt).length;
  return {
    id,
    label,
    n: firsts.length,
    holed,
    close,
    mid,
    far,
    known,
    noLeave: missed.length - leaves.length,
    avgLeave: mean(leaves),
    closePct: known > 0 ? ((holed + close) / known) * 100 : null,
    threePutts,
    threePuttPct: firsts.length > 0 ? (threePutts / firsts.length) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// The green
// ---------------------------------------------------------------------------

const G = { w: 320, h: 272, cx: 160, cy: 136, pxPerFt: 25, rings: 4 } as const;
const CUP_R = 5;
/** Spot radius: area is the count, scaled against the busiest spot (but never
 *  fewer than `refFloor`, so one miss is never a big circle); `minR` keeps a
 *  single miss visible on a busy team map; counts print inside from `labelR`. */
const SPOT = { maxR: 15, minR: 2.75, refFloor: 16, labelR: 8.5 } as const;
/** The 3-putt arc rides the spot's outline, so the centre stays free for the count. */
const ARC_W = 2.5;

interface Spot {
  key: string;
  count: number;
  /** Missed first putts at the spot: the only putts that carry a 3-putt flag. */
  firsts: number;
  threePutts: number;
  x: number;
  y: number;
  r: number;
  /** Of the spot's missed first putts, the share that led to a 3-putt: an arc
   *  clockwise from 12 o'clock. 0 (no arc) when no first putt finished there. */
  share: number;
  title: string;
}

function directionLabel(side: PuttShot['side'], depth: PuttShot['depth']): string {
  const s = side === 'low' ? 'low side' : side === 'high' ? 'high side' : null;
  const d = depth === 'short' ? 'Short' : depth === 'long' ? 'Long' : null;
  if (d && s) return `${d}, ${s}`;
  if (d) return d;
  return s === 'low side' ? 'Low side' : 'High side';
}

/**
 * One circle per measured spot: the tagged direction and the recorded leave
 * (4 ft and more share the outer ring). A spot never moves off its spot, so
 * nothing is packed or nudged; overlap between busy neighbours is drawn
 * biggest first, so every circle keeps a visible edge.
 */
function buildSpots(placed: readonly PuttShot[]): Spot[] {
  const groups = new Map<
    string,
    {
      side: PuttShot['side'];
      depth: PuttShot['depth'];
      leave: number | null;
      count: number;
      firsts: number;
      threePutts: number;
    }
  >();
  for (const p of placed) {
    const leave = p.leaveFeet! >= G.rings ? null : p.leaveFeet!;
    const key = `${p.side ?? '-'}|${p.depth ?? '-'}|${leave ?? `${G.rings}+`}`;
    const g = groups.get(key) ?? { side: p.side, depth: p.depth, leave, count: 0, firsts: 0, threePutts: 0 };
    g.count += 1;
    if (p.first) {
      g.firsts += 1;
      if (p.threePutt) g.threePutts += 1;
    }
    groups.set(key, g);
  }
  const ref = Math.max(SPOT.refFloor, ...[...groups.values()].map((g) => g.count));
  const radius = (n: number) => Math.max(SPOT.minR, SPOT.maxR * Math.sqrt(n / ref));
  return [...groups.entries()]
    .map(([key, g]) => {
      const dx = g.side === 'low' ? -1 : g.side === 'high' ? 1 : 0;
      const dy = g.depth === 'long' ? -1 : g.depth === 'short' ? 1 : 0;
      const len = Math.hypot(dx, dy) || 1;
      // A leave under half a foot (never logged in practice) is held just off the cup.
      const dist = (g.leave == null ? G.rings : Math.max(0.5, g.leave)) * G.pxPerFt;
      const where = g.leave == null ? `${G.rings} ft or more` : formatFeet(g.leave, Number.isInteger(g.leave) ? 0 : 1);
      return {
        key,
        count: g.count,
        firsts: g.firsts,
        threePutts: g.threePutts,
        x: G.cx + (dx / len) * dist,
        y: G.cy + (dy / len) * dist,
        r: radius(g.count),
        share: g.firsts > 0 ? g.threePutts / g.firsts : 0,
        title: `${directionLabel(g.side, g.depth)}, ${where}: ${fmtCount(g.count)} ${plural(g.count, 'miss', 'misses')}${
          g.threePutts > 0
            ? `; ${fmtCount(g.threePutts)} of ${fmtCount(g.firsts)} first ${plural(g.firsts, 'putt')} led to a 3-putt`
            : ''
        }`,
      };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

const LEAN_RECT: Record<Direction, [number, number, number, number]> = {
  low: [6, 6, G.cx - 6, G.h - 12],
  high: [G.cx, 6, G.w - G.cx - 6, G.h - 12],
  long: [6, 6, G.w - 12, G.cy - 6],
  short: [6, G.cy, G.w - 12, G.h - G.cy - 6],
};

const RING_FONT = 11;
/** Spots only sit on the axes and diagonals, so ring labels run along one of
 *  the half-angles between them: up and right first. */
const RING_ANGLES = [-67.5, -112.5, -22.5, -157.5, 67.5, 112.5, 22.5, 157.5] as const;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The axis names, which ring labels keep clear of. */
const AXIS_BOXES: readonly Box[] = [
  { x0: G.cx - 16, y0: 3, x1: G.cx + 16, y1: 15 },
  { x0: G.cx - 18, y0: G.h - 16, x1: G.cx + 18, y1: G.h - 4 },
  { x0: 6, y0: G.cy - 32, x1: 62, y1: G.cy - 19 },
  { x0: G.w - 66, y0: G.cy - 32, x1: G.w - 6, y1: G.cy - 19 },
];

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function touchesSpot(box: Box, s: Spot): boolean {
  const nx = Math.min(Math.max(s.x, box.x0), box.x1);
  const ny = Math.min(Math.max(s.y, box.y0), box.y1);
  return Math.hypot(s.x - nx, s.y - ny) < s.r + 1.5;
}

interface RingLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

/**
 * Ring distances, all on the one half-angle where the most of them clear the
 * spots (layout only: the rings themselves never move). A label that would sit
 * on a spot is left off; the evenly spaced rings still read.
 */
function placeRingLabels(spots: readonly Spot[]): RingLabel[] {
  let best: RingLabel[] = [];
  for (const deg of RING_ANGLES) {
    const a = (deg * Math.PI) / 180;
    const right = Math.cos(a) >= 0;
    const up = Math.sin(a) < 0;
    const fits: RingLabel[] = [];
    for (let i = 1; i <= G.rings; i += 1) {
      const text = i === G.rings ? `${G.rings}+ ft` : `${i} ft`;
      const x = G.cx + Math.cos(a) * i * G.pxPerFt + (right ? 3 : -3);
      const y = G.cy + Math.sin(a) * i * G.pxPerFt + (up ? -3 : RING_FONT);
      const w = text.length * RING_FONT * 0.56;
      const box = { x0: right ? x : x - w, x1: right ? x + w : x, y0: y - RING_FONT * 0.75, y1: y + 1 };
      if (spots.some((s) => touchesSpot(box, s)) || AXIS_BOXES.some((b) => overlaps(box, b))) continue;
      fits.push({ text, x, y, anchor: right ? 'start' : 'end' });
    }
    if (fits.length > best.length) best = fits;
    if (best.length === G.rings) break;
  }
  return best;
}

function MissGreen({ spots, lean, label }: { spots: readonly Spot[]; lean: Direction | null; label: string }) {
  const gradientId = `putt-green-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const rings = useMemo(() => placeRingLabels(spots), [spots]);
  const halo = { stroke: TURF, fill: 'var(--fw-color-text-secondary)' };
  const leanRect = lean ? LEAN_RECT[lean] : null;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${G.w} ${G.h}`}
      className="block h-auto w-full max-w-[22rem] font-fw-sans"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="50%" r="60%">
          <stop offset="0%" style={{ stopColor: TURF_HI }} />
          <stop offset="100%" style={{ stopColor: TURF }} />
        </radialGradient>
      </defs>
      <rect width={G.w} height={G.h} rx={18} fill={`url(#${gradientId})`} />
      {leanRect ? (
        <rect x={leanRect[0]} y={leanRect[1]} width={leanRect[2]} height={leanRect[3]} rx={12} style={{ fill: LEAN_FILL }} />
      ) : null}
      <g fill="none" strokeDasharray="2 3" style={{ stroke: TURF_LINE }}>
        {[1, 2, 3, 4].map((i) => (
          <circle key={i} cx={G.cx} cy={G.cy} r={i * G.pxPerFt} />
        ))}
      </g>
      <g style={{ stroke: TURF_LINE }}>
        <line x1={G.cx} x2={G.cx} y1={20} y2={G.h - 20} />
        <line x1={20} x2={G.w - 20} y1={G.cy} y2={G.cy} />
      </g>
      <circle
        cx={G.cx}
        cy={G.cy}
        r={CUP_R}
        strokeWidth={1.5}
        // A dark cup with a pale liner, in both themes (primitives, not the flipping surface tokens).
        style={{ fill: 'var(--fw-color-warm-950)', stroke: 'var(--fw-color-warm-200)' }}
      />
      {spots.map((s) => {
        const text = fmtCount(s.count);
        const size = s.r >= 12 ? 12 : 11;
        // The count prints only where it fits inside the circle.
        const labelled = s.r >= SPOT.labelR && text.length * size * 0.6 <= 2 * s.r - 3;
        const around = 2 * Math.PI * s.r;
        return (
          <g key={s.key} data-spot-count={s.count} data-three-putt-share={s.share > 0 ? s.share : undefined}>
            <title>{s.title}</title>
            <circle
              cx={s.x}
              cy={s.y}
              r={s.r}
              strokeWidth={1.25}
              style={{ fill: 'var(--fw-color-surface)', stroke: 'var(--fw-color-text-secondary)' }}
            />
            {s.share > 0 ? (
              <circle
                data-arc=""
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill="none"
                strokeWidth={ARC_W}
                strokeDasharray={s.share >= 1 ? undefined : `${s.share * around} ${around}`}
                transform={`rotate(-90 ${s.x} ${s.y})`}
                style={{ stroke: THREE_PUTT }}
              />
            ) : null}
            {labelled ? (
              <text
                x={s.x}
                y={s.y}
                dy="0.35em"
                textAnchor="middle"
                fontSize={size}
                fontWeight={600}
                className="tabular-nums"
                style={{ fill: 'var(--fw-color-text-primary)' }}
              >
                {text}
              </text>
            ) : null}
          </g>
        );
      })}
      <g fontSize={RING_FONT} paintOrder="stroke" strokeWidth={3} strokeLinejoin="round" style={halo}>
        {rings.map((r) => (
          <text key={r.text} x={r.x} y={r.y} textAnchor={r.anchor}>
            {r.text}
          </text>
        ))}
      </g>
      <g fontSize={11} fontWeight={600} paintOrder="stroke" strokeWidth={3} strokeLinejoin="round" style={halo}>
        <text x={G.cx} y={13} textAnchor="middle">
          Long
        </text>
        <text x={G.cx} y={G.h - 6} textAnchor="middle">
          Short
        </text>
        <text x={8} y={G.cy - 22}>
          Low side
        </text>
        <text x={G.w - 8} y={G.cy - 22} textAnchor="end">
          High side
        </text>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function SectionHead({ title, aside, className }: { title: string; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h4 className="min-w-0 font-fw-sans text-body-sm font-semibold text-text-primary">{title}</h4>
      {aside}
    </div>
  );
}

function LagStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  // Value above label (dt stays first for the dl); justify-end packs to the top
  // in column-reverse, so values line up when a label wraps.
  return (
    <div className="flex min-w-0 flex-col-reverse justify-end gap-0.5">
      <dt className="font-fw-sans text-caption leading-tight text-text-tertiary">{label}</dt>
      <dd
        className={cn(
          'font-fw-sans text-body font-semibold leading-tight tabular-nums',
          muted ? 'text-text-tertiary' : 'text-text-primary',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function LagRow({ read, on }: { read: LagRead; on: boolean }) {
  const thin = read.n > 0 && read.n < LOW_N;
  const segments = [
    { key: 'holed', n: read.holed, color: LAG_TONE.holed },
    { key: 'close', n: read.close, color: LAG_TONE.close },
    { key: 'mid', n: read.mid, color: LAG_TONE.mid },
    { key: 'far', n: read.far, color: LAG_TONE.far },
  ].filter((s) => s.n > 0);
  return (
    <div
      data-lag={read.id}
      className={cn(
        'flex min-w-0 flex-col gap-2.5 rounded-fw-md px-3 py-3',
        on ? 'bg-surface-sunken ring-1 ring-inset ring-border-control' : 'ring-1 ring-inset ring-border-subtle',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-fw-sans text-body-sm font-semibold text-text-primary">{read.label} ft</span>
        <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
          {`${fmtCount(read.n)} first ${plural(read.n, 'putt')}${thin ? ' · low sample' : ''}`}
        </span>
      </div>
      {read.n === 0 ? null : (
        <>
          {read.known > 0 ? (
            <span
              role="img"
              aria-label={`Where ${fmtCount(read.known)} first ${plural(read.known, 'putt')} from ${read.label} ft finished: ${fmtCount(
                read.holed,
              )} holed, ${fmtCount(read.close)} inside 3 ft, ${fmtCount(read.mid)} at 3 to 6 ft, ${fmtCount(read.far)} at 6 ft or more.`}
              className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
            >
              {segments.map((s) => (
                <span key={s.key} className="h-full min-w-1" style={{ flexGrow: s.n, flexBasis: 0, background: s.color }} />
              ))}
            </span>
          ) : null}
          <dl className="grid grid-cols-3 gap-3">
            <LagStat
              label="Avg leave"
              value={read.avgLeave == null ? (read.known > 0 ? 'All holed' : 'Not recorded') : formatFeet(read.avgLeave, 1)}
              muted={thin}
            />
            <LagStat
              label="Holed or inside 3 ft"
              value={read.closePct == null ? 'Not recorded' : formatPct(read.closePct)}
              muted={thin}
            />
            <LagStat label="3-putts" value={formatPct(read.threePuttPct)} muted={thin} />
          </dl>
        </>
      )}
    </div>
  );
}

/** A spot with part of its outline in the 3-putt colour, as drawn on the green. */
function ArcSwatch() {
  const r = 4.75;
  const around = 2 * Math.PI * r;
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0">
      <circle
        cx={6}
        cy={6}
        r={r}
        strokeWidth={1.25}
        style={{ fill: 'var(--fw-color-surface)', stroke: 'var(--fw-color-text-secondary)' }}
      />
      <circle
        cx={6}
        cy={6}
        r={r}
        fill="none"
        strokeWidth={2}
        strokeDasharray={`${around * 0.375} ${around}`}
        transform="rotate(-90 6 6)"
        style={{ stroke: THREE_PUTT }}
      />
    </svg>
  );
}

function Swatch({ color, hollow, line }: { color: string; hollow?: boolean; line?: boolean }) {
  if (line) {
    return (
      <span aria-hidden className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: color }} />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 rounded-full"
      style={hollow ? { border: `1.5px solid ${color}` } : { background: color }}
    />
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function PuttCause({ data, allowed, playerId, playerName, className }: CauseProps) {
  const [band, setBand] = useState<BandSel>('all');
  const [brk, setBrk] = useState<PuttBreak | 'all'>('all');
  const [slope, setSlope] = useState<PuttSlope | 'all'>('all');
  const headingId = useId();
  const highlightId = `putt-length-${useId()}`;
  /** The length columns, so clearing a pick can hand focus back to the chart. */
  const lengthButtons = useRef(new Map<string, HTMLButtonElement>());
  const reduceMotion = useReducedMotionGuard();
  const isPlayer = playerId != null;
  const tourLabel = data.tourLabel;
  const filtering = brk !== 'all' || slope !== 'all';

  const read = useMemo(() => {
    const slice = inRounds(data.putts, allowed, data.rounds, playerId);
    const filtered = bandPutts(slice, band, brk, slope);
    const summary = puttSummary(filtered);
    const inBand = bandPutts(slice, band);
    const bandMake = puttSummary(inBand).makePct;
    const everyLength = puttsIn(slice, 'all', brk, slope);

    // Make % by length. Inside 3 ft is its own column once it has a sample;
    // it is decided on the whole slice so the chart doesn't shift under a filter.
    const inside3 = slice.filter((p) => p.feet < PUTT_BANDS[0].min).length;
    const showInside = inside3 >= LOW_N || band === 'in3';
    const lengths: LengthRead[] = [...(showInside ? [INSIDE_3] : []), ...LENGTHS].map((def) => {
      const sub = bandPutts(slice, def.id, brk, slope);
      const make = puttSummary(sub).makePct;
      const raw = def.ref ? data.refs.puttMake[def.ref] : null;
      const tour = raw != null && Number.isFinite(raw) ? raw : null;
      const thin = sub.length > 0 && sub.length < LOW_N;
      const gap = tour != null && !filtering && sub.length >= LOW_N ? pointGap(make, tour) : null;
      const parts = [
        sub.length === 0
          ? `${def.long}: no putts`
          : `${def.long}: ${formatPct(make)} made, ${fmtCount(sub.length)} ${plural(sub.length, 'putt')}`,
      ];
      if (sub.length > 0) {
        if (def.ref == null) parts.push('No tour standard');
        else if (tour != null) {
          parts.push(`${tourLabel} ${formatPct(tour)}${filtering ? ' for all putts' : ''}`);
          if (gap != null) parts.push(gap === 0 ? `Level with ${tourLabel}` : `${Math.abs(gap)} ${plural(Math.abs(gap), 'point')} ${gap < 0 ? 'below' : 'above'}`);
          else if (thin) parts.push(`Under ${LOW_N} putts, not compared`);
        } else if (thin) parts.push(`Under ${LOW_N} putts`);
      }
      return { def, n: sub.length, make, tour, gap, thin, aria: parts.join('. ') };
    });

    // Break × slope, shaded against the band's own make %.
    const cells = PUTT_SLOPES.map((s) =>
      PUTT_BREAKS.map((k) => {
        const sub = bandPutts(slice, band, k.id, s.id);
        const make = puttSummary(sub).makePct;
        return { slope: s, brk: k, n: sub.length, make, gap: sub.length >= LOW_N ? pointGap(make, bandMake) : null };
      }),
    );

    // Lag: first putts from 15 ft and out, under the break / slope filter.
    const lag = LAG_IDS.map((id) => {
      const def = PUTT_BANDS.find((b) => b.id === id)!;
      return lagRead(id, def.label, puttsIn(slice, id, brk, slope));
    });

    // Misses: how many carry a direction, and which of those have a leave.
    const misses = filtered.filter((p) => !p.made);
    const tagged = misses.filter((p) => p.side || p.depth);
    const placed = tagged.filter((p) => p.leaveFeet != null && Number.isFinite(p.leaveFeet));
    const sided = misses.filter((p) => p.side);
    const depthed = misses.filter((p) => p.depth);
    const tiles: { dir: Direction; label: string; pct: number | null; count: number; of: number }[] = [
      { dir: 'low', label: 'Low side', pct: summary.lowPct, count: sided.filter((p) => p.side === 'low').length, of: sided.length },
      { dir: 'high', label: 'High side', pct: summary.highPct, count: sided.filter((p) => p.side === 'high').length, of: sided.length },
      { dir: 'short', label: 'Short', pct: summary.shortPct, count: depthed.filter((p) => p.depth === 'short').length, of: depthed.length },
      { dir: 'long', label: 'Long', pct: summary.longPct, count: depthed.filter((p) => p.depth === 'long').length, of: depthed.length },
    ];
    // The lean is a judgement, so a side or depth pair needs LOW_N tags first.
    const ranked = tiles.filter((t) => t.pct != null && t.of >= LOW_N).sort((a, b) => b.pct! - a.pct!);
    const lean =
      ranked.length > 0 && (ranked.length === 1 || Math.round(ranked[0]!.pct!) > Math.round(ranked[1]!.pct!))
        ? ranked[0]!.dir
        : null;

    return {
      total: slice.length,
      summary,
      firsts: filtered.filter((p) => p.first).length,
      all: { n: everyLength.length, make: puttSummary(everyLength).makePct },
      inside3,
      showInside,
      under3: everyLength.filter((p) => p.feet < PUTT_BANDS[0].min).length,
      lengths,
      cells,
      bandMake,
      gridUntagged: inBand.filter((p) => !p.brk || !p.slope).length,
      lag,
      misses: misses.length,
      tagged: tagged.length,
      placed,
      untagged: misses.length - tagged.length,
      noLeave: tagged.length - placed.length,
      placedFirsts: placed.filter((p) => p.first).length,
      threePutts: placed.filter((p) => p.first && p.threePutt).length,
      tiles,
      lean,
    };
  }, [data, allowed, playerId, band, brk, slope, filtering, tourLabel]);

  const spots = useMemo(() => buildSpots(read.placed), [read.placed]);

  const { summary } = read;
  const who = playerName ?? (isPlayer ? 'Player' : 'Whole team');
  const bandDef = band === 'all' ? null : band === 'in3' ? INSIDE_3 : LENGTHS.find((b) => b.id === band) ?? null;
  const bandLabel = bandDef?.long ?? null;
  const filterLabel = filtering
    ? [PUTT_SLOPES.find((s) => s.id === slope)?.label, PUTT_BREAKS.find((k) => k.id === brk)?.label.toLowerCase()]
        .filter(Boolean)
        .join(', ')
    : null;
  const overline = [who, `${fmtCount(summary.n)} ${plural(summary.n, 'putt')}`, bandLabel, filterLabel]
    .filter(Boolean)
    .join(' · ');

  const pills: string[] = [];
  if (summary.n === 0) pills.push('No putts');
  else {
    pills.push(read.firsts === 0 ? 'No first putts' : `3-putt ${formatPct(summary.threePuttPct)}`);
    if (summary.n < LOW_N) pills.push(`Low sample · ${summary.n} ${plural(summary.n, 'putt')}`);
  }

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={headingId} className="font-fw-display text-h3 font-semibold text-text-primary">
          How putts miss
        </h3>
        <p className="truncate font-fw-sans text-caption text-text-tertiary">{overline}</p>
      </div>
      {read.total > 0 ? (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span data-figure="" className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary">
            {formatPct(summary.makePct)}
          </span>
          <span className="font-fw-sans text-caption text-text-tertiary">made</span>
          <span className="flex flex-col items-end gap-1">
            {pills.map((p) => (
              <span key={p} className={PILL}>
                {p}
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );

  const shell = cn(
    'flex min-w-0 flex-col gap-5 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
    className,
  );

  if (read.total === 0) {
    return (
      <section aria-labelledby={headingId} className={shell}>
        {header}
        <EmptyState
          variant="subtle"
          title="No putts in this slice"
          description="No tracked putts in these rounds yet. They show up here once rounds are logged shot by shot."
        />
      </section>
    );
  }

  // --- Make % by length ------------------------------------------------------
  const anyTour = read.lengths.some((l) => l.tour != null);
  const anyRef = LENGTHS.some((d) => d.ref != null && data.refs.puttMake[d.ref] != null);
  const judged = read.lengths.filter((l) => l.gap != null);
  const anyThin = read.lengths.some((l) => l.thin);
  const anyShortfall = judged.some((l) => l.tour != null && l.tour > (l.make ?? 0));
  let headline: string | null = null;
  if (judged.length > 0) {
    const worst = judged.reduce((a, b) => (b.gap! < a.gap! ? b : a));
    headline =
      worst.gap! < 0
        ? `Furthest behind ${tourLabel} at ${unbroken(worst.def.long)}: ${formatPct(worst.make)} made vs\u00a0${formatPct(worst.tour)}.`
        : `At or above ${tourLabel} at every length with ${LOW_N}+ putts.`;
  }
  const chartNotes = [
    judged.length > 0 ? `Under each bar: points behind or ahead of ${tourLabel}, then putts.` : 'Under each bar: putts.',
    read.showInside && anyTour ? 'Inside 3 ft has no tour standard.' : null,
    filtering && anyRef ? `${tourLabel} marks cover all putts, so gaps are off while break and slope filter the card.` : null,
    !anyRef ? 'No tour make % on file, so lengths are not compared.' : null,
    !read.showInside && band === 'all' && read.under3 > 0
      ? `All includes ${fmtCount(read.under3)} ${plural(read.under3, 'putt')} inside 3 ft.`
      : null,
  ].filter(Boolean);

  const chart = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {/* The row holds the chip's height either way, so picking a length never shifts the chart. */}
        <SectionHead
          className="min-h-7"
          title="Make % by length"
          aside={
            band === 'all' ? (
              <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">Tap a length to filter</span>
            ) : (
              // A compact chip with a 44 px hit area (the ::before) for touch.
              <PressTarget
                haptic="select"
                aria-label={`All lengths: ${formatPct(read.all.make)} made, ${fmtCount(read.all.n)} ${plural(read.all.n, 'putt')}`}
                onClick={() => {
                  // The chip leaves with the pick, so focus goes to the length it cleared.
                  const picked = band;
                  setBand('all');
                  lengthButtons.current.get(picked)?.focus();
                }}
                className="relative inline-flex h-7 shrink-0 items-center rounded-full border border-border-control bg-surface px-3 font-fw-sans text-caption font-semibold text-text-secondary before:absolute before:-inset-2 hover:text-text-primary"
              >
                All lengths
              </PressTarget>
            )
          }
        />
        {headline ? <p className="font-fw-sans text-body-sm text-text-secondary">{headline}</p> : null}
      </div>

      <div
        role="group"
        aria-label="Make % by length, feet"
        className="grid"
        style={{ gridTemplateColumns: `repeat(${read.lengths.length}, minmax(0, 1fr))` }}
      >
        {read.lengths.map((l) => {
          const on = band === l.def.id;
          const blocked = l.n === 0 && !on;
          const dim = band !== 'all' && !on;
          const make = l.make ?? 0;
          const fill = dim ? BAR_DIM : BAR;
          return (
            <PressTarget
              key={l.def.id}
              ref={(el) => {
                if (el) lengthButtons.current.set(l.def.id, el);
                else lengthButtons.current.delete(l.def.id);
              }}
              data-length={l.def.id}
              haptic={!blocked}
              aria-pressed={on}
              aria-disabled={blocked || undefined}
              aria-label={l.aria}
              onClick={() => {
                if (!blocked) setBand(on ? 'all' : l.def.id);
              }}
              className={cn(
                'relative isolate flex min-w-0 flex-col items-stretch rounded-fw-md pb-2 pt-2 text-center font-fw-sans tabular-nums',
                blocked ? 'cursor-default' : !on && 'hover:bg-surface-sunken',
              )}
            >
              {on ? (
                <motion.span
                  layoutId={reduceMotion ? undefined : highlightId}
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-fw-md bg-surface-sunken ring-1 ring-inset ring-border-control"
                  transition={reduceMotion ? { duration: 0 } : { duration: DURATION.short, ease: EASE_CINEMATIC }}
                />
              ) : null}
              <span
                className={cn(
                  'h-5 px-0.5 text-body-sm font-semibold leading-5 [@container(min-width:480px)]:h-6 [@container(min-width:480px)]:text-body [@container(min-width:480px)]:font-semibold',
                  l.thin ? 'text-text-tertiary' : 'text-text-primary',
                )}
              >
                {l.n === 0 ? ' ' : formatPct(l.make)}
              </span>
              <span aria-hidden className="relative mt-1.5 block h-28 [@container(min-width:560px)]:h-36">
                <span
                  className="absolute inset-x-0 top-1/2 border-t"
                  style={{ borderColor: 'var(--fw-viz-grid)' }}
                />
                <span
                  className="absolute inset-x-0 bottom-0 border-t"
                  style={{ borderColor: 'var(--fw-color-border-strong)' }}
                />
                {l.gap != null && l.tour != null && l.tour > make ? (
                  <span
                    className={cn('absolute left-1/2 w-3/5 max-w-6 -translate-x-1/2', dim && 'opacity-50')}
                    style={{ bottom: `${make}%`, height: `${l.tour - make}%`, background: SHORTFALL }}
                  />
                ) : null}
                {l.n > 0 && make > 0 ? (
                  <span
                    data-bar={l.thin ? 'hollow' : 'solid'}
                    className="absolute bottom-0 left-1/2 w-3/5 max-w-6 -translate-x-1/2"
                    style={{
                      height: `${make}%`,
                      borderRadius: '4px 4px 0 0',
                      ...(l.thin
                        ? { border: `1.5px solid ${fill}`, borderBottom: 'none' }
                        : { background: fill }),
                    }}
                  />
                ) : null}
                {l.tour != null ? (
                  <span
                    data-tour-mark=""
                    className="absolute left-1/2 h-0.5 w-4/5 max-w-10 -translate-x-1/2 rounded-full"
                    style={{
                      bottom: `calc(${l.tour}% - 1px)`,
                      background: TOUR_MARK,
                      boxShadow: '0 0 0 1px var(--fw-color-surface)',
                    }}
                  />
                ) : null}
              </span>
              <span
                className={cn(
                  'mt-2 px-0.5 text-caption font-semibold leading-tight',
                  on ? 'text-text-primary' : 'text-text-secondary',
                )}
              >
                {l.def.label}
              </span>
              {judged.length > 0 ? (
                <span
                  data-gap={l.gap ?? undefined}
                  className={cn(
                    'px-0.5 text-caption font-semibold leading-tight',
                    l.gap != null ? SG_TONE_TEXT[gapTone(l.gap)] : 'text-text-tertiary',
                  )}
                >
                  {l.gap != null ? (
                    <>
                      {signed(l.gap)}
                      <span className="hidden [@container(min-width:480px)]:inline"> {plural(Math.abs(l.gap), 'pt')}</span>
                    </>
                  ) : (
                    ' '
                  )}
                </span>
              ) : null}
              <span className="px-0.5 text-caption leading-tight text-text-tertiary">
                {fmtCount(l.n)}
                <span className="hidden [@container(min-width:480px)]:inline"> {plural(l.n, 'putt')}</span>
              </span>
            </PressTarget>
          );
        })}
      </div>

      {anyTour || anyThin ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-secondary">
          {anyTour ? (
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={TOUR_MARK} line />
              {`${tourLabel} make %`}
            </span>
          ) : null}
          {anyShortfall ? (
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={SHORTFALL} />
              {`Gap to ${tourLabel}`}
            </span>
          ) : null}
          {anyThin ? (
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={BAR} hollow />
              {`Under ${LOW_N} putts, not compared`}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className="font-fw-sans text-caption text-text-tertiary">{chartNotes.join(' ')}</p>
    </div>
  );

  // --- Lag -------------------------------------------------------------------
  const lagNoLeave = read.lag.reduce((s, l) => s + l.noLeave, 0);
  const lagAny = read.lag.some((l) => l.n > 0);
  const lag = (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
      <SectionHead
        title="Lag putting"
        aside={<span className="shrink-0 font-fw-sans text-caption text-text-tertiary">First putts from 15 ft</span>}
      />
      {lagAny ? (
        <>
          <div className="grid grid-cols-1 gap-2 [@container(min-width:600px)]:grid-cols-2">
            {read.lag.map((l) => (
              <LagRow key={l.id} read={l} on={band === l.id} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={LAG_TONE.holed} />
              Holed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={LAG_TONE.close} />
              Inside 3 ft
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={LAG_TONE.mid} />3 to 6 ft
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={LAG_TONE.far} />6 ft or more
            </span>
          </div>
          <p className="font-fw-sans text-caption text-text-tertiary">
            {`Leave is the next putt's measured length.${
              lagNoLeave > 0
                ? ` ${fmtCount(lagNoLeave)} missed ${plural(lagNoLeave, 'lag')} with no next putt recorded ${
                    lagNoLeave === 1 ? 'is' : 'are'
                  } left out of the leave figures.`
                : ''
            }`}
          </p>
        </>
      ) : (
        <p className="font-fw-sans text-body-sm text-text-secondary">No first putts from 15 ft or more in this slice.</p>
      )}
    </div>
  );

  // --- Where misses finish ---------------------------------------------------
  const leanTile = read.tiles.find((t) => t.dir === read.lean);
  const greenLabel =
    read.placed.length === 0
      ? 'No misses to place around the hole.'
      : `Missed putts around the hole: ${fmtCount(read.placed.length)} placed by measured leave and tagged direction, at ${
          spots.length
        } ${plural(spots.length, 'spot')}${
          leanTile
            ? `; ${formatPct(leanTile.pct)} of tagged misses finish ${
                leanTile.dir === 'low' || leanTile.dir === 'high' ? `on the ${leanTile.label.toLowerCase()}` : leanTile.label.toLowerCase()
              }`
            : ''
        }.${
          read.placedFirsts > 0
            ? ` Of ${fmtCount(read.placedFirsts)} first ${plural(read.placedFirsts, 'putt')} placed, ${fmtCount(
                read.threePutts,
              )} led to a 3-putt.`
            : ''
        }`;
  const coveragePct = read.misses > 0 ? (read.tagged / read.misses) * 100 : 0;
  const missesSection = (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
      <SectionHead title="Where misses finish" />
      {read.misses === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-secondary">No misses in this slice.</p>
      ) : (
        <>
          <div data-coverage="" className="flex items-center gap-3 rounded-fw-md bg-surface-sunken px-3 py-2.5">
            <span
              aria-hidden
              className="relative block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${coveragePct}%`, background: 'var(--fw-color-text-secondary)' }}
              />
            </span>
            <p className="min-w-0 font-fw-sans text-body-sm text-text-secondary">
              <span className="font-semibold text-text-primary">
                {`Direction tagged on ${fmtCount(read.tagged)} of ${fmtCount(read.misses)} ${plural(read.misses, 'miss', 'misses')}`}
              </span>
              {read.untagged === 0
                ? ' (all of them).'
                : ` (${formatPct(coveragePct)}). ${
                    read.untagged === 1 ? "The other miss can't" : `The other ${fmtCount(read.untagged)} can't`
                  } be placed.`}
            </p>
          </div>
          {read.tagged === 0 ? null : (
            <div className="grid grid-cols-1 items-center gap-4 [@container(min-width:620px)]:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <div className="flex justify-center">
                <MissGreen spots={spots} lean={read.lean} label={greenLabel} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {read.tiles.map((t) => {
                  const dom = t.dir === read.lean;
                  return (
                    <div
                      key={t.dir}
                      data-tile={t.dir}
                      data-lean={dom || undefined}
                      className={cn(
                        'flex min-w-0 flex-col gap-1.5 rounded-fw-md border p-3',
                        // The lean is a neutral emphasis: amber means 3-putt on this card.
                        dom ? 'border-border-control bg-surface-sunken' : 'border-border-subtle bg-surface-sunken',
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-fw-sans text-caption font-medium text-text-secondary">{t.label}</span>
                        <span className="font-fw-sans text-h3 font-semibold leading-none text-text-primary">
                          {t.of > 0 ? formatPct(t.pct) : ' '}
                        </span>
                      </span>
                      <span aria-hidden className="block h-1 rounded-full bg-surface">
                        {t.pct != null ? (
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, t.pct))}%`,
                              background: dom ? 'var(--fw-color-text-primary)' : 'var(--fw-color-text-tertiary)',
                            }}
                          />
                        ) : null}
                      </span>
                      <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                        {t.of > 0 ? `${fmtCount(t.count)} of ${fmtCount(t.of)} tagged` : 'No tags'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {read.placed.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: 'var(--fw-color-surface)', border: '1.25px solid var(--fw-color-text-secondary)' }}
                />
                Misses at that spot, sized by count
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ArcSwatch />
                Arc: first putts that led to a 3-putt
              </span>
            </div>
          ) : null}
          {read.tagged > 0 ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              {`Distance from the hole is the measured leave (the next putt's length); direction is the tagged side and depth. Leaves of ${
                G.rings
              } ft or more share the outer ring.${
                read.noLeave > 0
                  ? ` ${fmtCount(read.noLeave)} tagged ${plural(read.noLeave, 'miss', 'misses')} with no leave recorded ${
                      read.noLeave === 1 ? "isn't" : "aren't"
                    } drawn.`
                  : ''
              }`}
            </p>
          ) : null}
        </>
      )}
    </div>
  );

  // --- Break × slope ---------------------------------------------------------
  const grid = (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-5">
      <SectionHead
        title="Make % by break and slope"
        aside={
          <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">
            {filtering ? 'Tap again to clear' : 'Tap to filter'}
          </span>
        }
      />
      <div
        role="group"
        aria-label="Make % by break and slope"
        className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] gap-1.5 [@container(min-width:480px)]:grid-cols-[6rem_repeat(3,minmax(0,1fr))]"
      >
        <span aria-hidden />
        {PUTT_BREAKS.map((k) => (
          <span
            key={k.id}
            className="flex items-end justify-center pb-1 text-center font-fw-sans text-caption leading-tight text-text-tertiary"
          >
            {k.label}
          </span>
        ))}
        {read.cells.map((row, si) => {
          const s = PUTT_SLOPES[si]!;
          return [
            <span
              key={`${s.id}-label`}
              className="flex items-center font-fw-sans text-caption font-medium text-text-secondary [@container(min-width:480px)]:text-body-sm [@container(min-width:480px)]:font-medium"
            >
              {s.label}
            </span>,
            ...row.map((c) => {
              const on = brk === c.brk.id && slope === c.slope.id;
              const blocked = c.n === 0 && !on;
              const thin = c.n < LOW_N;
              const tint = cellTint(c.gap);
              return (
                <PressTarget
                  key={`${s.id}-${c.brk.id}`}
                  haptic={!blocked}
                  aria-pressed={on}
                  aria-disabled={blocked || undefined}
                  aria-label={`${c.slope.label}, ${c.brk.label.toLowerCase()}: ${
                    c.n === 0
                      ? 'no putts'
                      : `${formatPct(c.make)} made, ${fmtCount(c.n)} ${plural(c.n, 'putt')}${thin ? ', low sample' : ''}`
                  }`}
                  onClick={() => {
                    if (blocked) return;
                    if (on) {
                      setBrk('all');
                      setSlope('all');
                    } else {
                      setBrk(c.brk.id);
                      setSlope(c.slope.id);
                    }
                  }}
                  className={cn(
                    'flex min-h-14 min-w-0 flex-col items-start justify-center gap-0.5 rounded-fw-md px-2 py-2 text-left [@container(min-width:480px)]:px-2.5',
                    !tint && 'bg-surface-sunken',
                    on ? 'ring-2 ring-text-primary' : 'ring-1 ring-border-subtle',
                    blocked && 'cursor-default',
                  )}
                  style={tint ? { background: tint } : undefined}
                >
                  <span
                    className={cn(
                      'font-fw-sans text-body font-semibold leading-tight tabular-nums',
                      thin ? 'text-text-tertiary' : 'text-text-primary',
                    )}
                  >
                    {c.n === 0 ? ' ' : formatPct(c.make)}
                  </span>
                  <span className="font-fw-sans text-caption leading-tight tabular-nums text-text-tertiary">
                    {c.n === 0 ? (
                      'no putts'
                    ) : thin ? (
                      <>
                        <span className="whitespace-nowrap">{fmtCount(c.n)} ·</span>{' '}
                        <span className="whitespace-nowrap">low sample</span>
                      </>
                    ) : (
                      `${fmtCount(c.n)} putts`
                    )}
                  </span>
                </PressTarget>
              );
            }),
          ];
        })}
      </div>
      <p className="font-fw-sans text-caption text-text-tertiary">
        {`Shaded against ${band === 'all' || !bandLabel ? 'all putts' : unbroken(bandLabel)}, ${formatPct(read.bandMake)} made, once a cell has ${LOW_N} putts.`}
        {read.gridUntagged > 0
          ? ` ${fmtCount(read.gridUntagged)} ${plural(read.gridUntagged, 'putt')} without a break and slope tag ${
              read.gridUntagged === 1 ? "isn't" : "aren't"
            } in the grid.`
          : ''}
      </p>
    </div>
  );

  return (
    <section aria-labelledby={headingId} className={shell}>
      {header}
      {chart}
      {summary.n === 0 ? (
        <EmptyState
          variant="subtle"
          title="No putts match this filter"
          description="Pick another length, or tap the break and slope cell again to clear it."
        />
      ) : (
        <>
          {lag}
          {missesSection}
        </>
      )}
      {grid}
    </section>
  );
}
